/**
 * Ideal Postcodes (Royal Mail PAF & Ordnance Survey) Address Verification Service
 * Server-side credit-conscious address lookup with in-memory caching.
 *
 * Optimisation strategy:
 *  1. In-memory Map cache keyed by clean postcode — 24h TTL, max 500 entries.
 *  2. Minimum 3-char length guard to block partial/junk queries.
 *  3. Reads real remaining credits from Ideal Postcodes response body.
 *  4. Handles credit-exhaustion code (4020) gracefully — returns empty list
 *     instead of crashing, so the user can type their address manually.
 *  5. Dev/test mock path when no API key is set.
 */

// ---------------------------------------------------------------------------
// Zero-dependency in-memory cache (Map + TTL)
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_ENTRIES = 500;

/** @type {Map<string, { result: object, cachedAt: number }>} */
const _postcodeCache = new Map();

function _getCached(key) {
  const entry = _postcodeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    _postcodeCache.delete(key);
    return null;
  }
  return entry.result;
}

function _setCache(key, result) {
  if (_postcodeCache.size >= CACHE_MAX_ENTRIES) {
    // Evict the oldest inserted key
    _postcodeCache.delete(_postcodeCache.keys().next().value);
  }
  _postcodeCache.set(key, { result, cachedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let _creditsRemaining = null; // Updated from API response on each live call

function getApiKey() {
  return (
    process.env.IDEAL_POSTCODE_API_KEY  ||
    process.env.IDEAL_POSTECOD_API_KEY  ||
    process.env.IDEAL_POSTCODES_API_KEY ||
    ''
  ).trim();
}

function cleanUKPostcode(postcodeStr) {
  if (!postcodeStr || typeof postcodeStr !== 'string') return '';
  return postcodeStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function formatPAFAddressItem(item) {
  const line1 = [item.line_1, item.line_2].filter(Boolean).join(', ');
  const parts = [
    item.sub_building_name,
    item.building_name,
    item.building_number,
    item.thoroughfare || item.line_1,
    item.post_town,
    item.postcode,
  ].filter(Boolean);

  const fullSummary = item.premise
    ? `${item.premise}, ${line1}, ${item.post_town}, ${item.postcode}`
    : parts.join(', ');

  return {
    udprn:            item.udprn || item.id || `paf_${Date.now()}`,
    summary:          fullSummary,
    line_1:           item.line_1 || item.thoroughfare || '',
    line_2:           item.line_2 || item.locality || '',
    line_3:           item.line_3 || '',
    premise:          item.premise || item.building_number || '',
    building_name:    item.building_name || '',
    sub_building_name:item.sub_building_name || '',
    building_number:  item.building_number || '',
    thoroughfare:     item.thoroughfare || '',
    post_town:        item.post_town || '',
    postcode:         item.postcode || '',
    country:          item.country || 'England',
    latitude:         item.latitude || null,
    longitude:        item.longitude || null,
  };
}

// ---------------------------------------------------------------------------
// Main lookup function
// ---------------------------------------------------------------------------

const MOCK_ADDRESSES = [
  {
    udprn: 'paf_mock_101',
    summary: 'Flat 4, St Johns Court, 14 Maple Close, London, SW1A 1AA',
    line_1: 'Flat 4, St Johns Court', line_2: '14 Maple Close',
    post_town: 'LONDON', postcode: 'SW1A 1AA',
    building_name: 'St Johns Court', sub_building_name: 'Flat 4',
  },
  {
    udprn: 'paf_mock_102',
    summary: 'Flat 5, St Johns Court, 14 Maple Close, London, SW1A 1AA',
    line_1: 'Flat 5, St Johns Court', line_2: '14 Maple Close',
    post_town: 'LONDON', postcode: 'SW1A 1AA',
    building_name: 'St Johns Court', sub_building_name: 'Flat 5',
  },
  {
    udprn: 'paf_mock_103',
    summary: '14 Maple Close, London, SW1A 1AA',
    line_1: '14 Maple Close', line_2: '',
    post_town: 'LONDON', postcode: 'SW1A 1AA',
    building_name: '', sub_building_name: '',
  },
];

/**
 * Searches Ideal Postcodes API for a given UK postcode (Royal Mail PAF licensed data).
 * Results are cached server-side for 24 hours — the same postcode only ever costs
 * 1 API credit no matter how many users look it up within the TTL window.
 */
async function lookupPostcode(rawPostcode) {
  const apiKey = getApiKey();
  const cleanPostcode = cleanUKPostcode(rawPostcode);

  // --- Guard: minimum 3 chars to block single-letter or empty queries ---
  if (!cleanPostcode || cleanPostcode.length < 3) {
    throw new Error('Please enter at least a partial UK postcode (e.g. SW1A or SW1A1AA).');
  }

  // --- Dev / test mock path ---
  if (!apiKey || apiKey === 'MOCK_KEY' || cleanPostcode === 'ID11QD' || cleanPostcode === 'TEST11AA') {
    console.log('[AddressService] Using dev mock PAF address dataset (no API key set).');
    return {
      success: true,
      isMock: true,
      postcode: rawPostcode.toUpperCase(),
      totalAddresses: MOCK_ADDRESSES.length,
      creditsRemaining: null,
      cached: false,
      addresses: MOCK_ADDRESSES,
    };
  }

  // --- Cache check: zero API credits for repeat lookups ---
  const cached = _getCached(cleanPostcode);
  if (cached) {
    console.log(`[AddressService] ✓ Cache HIT for "${cleanPostcode}" — 0 credits used.`);
    return { ...cached, cached: true };
  }

  console.log(`[AddressService] Cache MISS — calling Ideal Postcodes for "${cleanPostcode}"...`);

  const url = `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(cleanPostcode)}?api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Read real credit balance from response body or headers
    if (typeof data.limit !== 'undefined' && typeof data.used !== 'undefined') {
      _creditsRemaining = data.limit - data.used;
    }
    const hdr = response.headers.get('X-Ideal-Postcodes-Remaining');
    if (hdr) _creditsRemaining = parseInt(hdr, 10);

    // --- Credit exhaustion (API code 4020 or HTTP 402) ---
    if (response.status === 402 || data.code === 4020) {
      console.error('[AddressService] ⚠️  Ideal Postcodes credits EXHAUSTED.');
      return {
        success: false,
        creditsExhausted: true,
        message: 'Address lookup is temporarily unavailable. Please type your full address manually.',
        addresses: [],
        cached: false,
      };
    }

    // --- Not found ---
    if (response.status === 404 || data.code === 4040) {
      return {
        success: false,
        message: `No Royal Mail PAF records found for postcode "${rawPostcode.toUpperCase()}". Please verify and try again, or type your address manually.`,
        addresses: [],
        cached: false,
      };
    }

    if (!response.ok || data.code !== 2000) {
      console.error('[AddressService] Ideal Postcodes API error:', data.message || data.code);
      throw new Error(data.message || 'Postcode lookup failed.');
    }

    if (_creditsRemaining !== null && _creditsRemaining <= 10) {
      console.warn(`[AddressService] ⚠️  Credits LOW: ${_creditsRemaining} remaining!`);
    } else {
      console.log(`[AddressService] ✓ Lookup OK — ${_creditsRemaining ?? '?'} credits remaining.`);
    }

    const formattedAddresses = (Array.isArray(data.result) ? data.result : []).map(formatPAFAddressItem);

    const result = {
      success: true,
      postcode: rawPostcode.toUpperCase(),
      totalAddresses: formattedAddresses.length,
      creditsRemaining: _creditsRemaining,
      cached: false,
      addresses: formattedAddresses,
    };

    // Store in cache — subsequent lookups of this postcode are free
    _setCache(cleanPostcode, result);

    return result;
  } catch (err) {
    console.error('[AddressService] Lookup Exception:', err.message);
    throw err;
  }
}

/**
 * Returns cache statistics for monitoring / health endpoint.
 */
function getCacheStats() {
  return {
    entries: _postcodeCache.size,
    maxEntries: CACHE_MAX_ENTRIES,
    ttlHours: CACHE_TTL_MS / (60 * 60 * 1000),
    creditsRemainingLastKnown: _creditsRemaining,
  };
}

module.exports = {
  lookupPostcode,
  cleanUKPostcode,
  getApiKey,
  getCacheStats,
};

