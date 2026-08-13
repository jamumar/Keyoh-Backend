/**
 * Ideal Postcodes (Royal Mail PAF & Ordnance Survey) Address Verification Service
 * Server-side credit-conscious address lookup.
 */

let creditsUsed = 0;
const INITIAL_TRIAL_CREDITS = 50;

function getApiKey() {
  return (
    process.env.IDEAL_POSTCODE_API_KEY ||
    process.env.IDEAL_POSTECOD_API_KEY ||
    process.env.IDEAL_POSTCODES_API_KEY ||
    ''
  ).trim();
}

/**
 * Normalizes UK Postcode (removes spaces & uppercase)
 */
function cleanUKPostcode(postcodeStr) {
  if (!postcodeStr || typeof postcodeStr !== 'string') return '';
  return postcodeStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Formats a raw Ideal Postcodes PAF item into structured KEYOH address format
 */
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
    udprn: item.udprn || item.id || `paf_${Date.now()}`,
    summary: fullSummary,
    line_1: item.line_1 || item.thoroughfare || '',
    line_2: item.line_2 || item.locality || '',
    line_3: item.line_3 || '',
    premise: item.premise || item.building_number || '',
    building_name: item.building_name || '',
    sub_building_name: item.sub_building_name || '',
    building_number: item.building_number || '',
    thoroughfare: item.thoroughfare || '',
    post_town: item.post_town || '',
    postcode: item.postcode || '',
    country: item.country || 'England',
    latitude: item.latitude || null,
    longitude: item.longitude || null,
  };
}

/**
 * Searches Ideal Postcodes API for a given UK postcode (Royal Mail PAF licensed data)
 */
async function lookupPostcode(rawPostcode) {
  const apiKey = getApiKey();
  const cleanPostcode = cleanUKPostcode(rawPostcode);

  if (!cleanPostcode) {
    throw new Error('Valid UK postcode is required.');
  }

  console.log(`[AddressService] Looking up Royal Mail PAF postcode "${cleanPostcode}"...`);

  if (!apiKey || apiKey === 'MOCK_KEY' || cleanPostcode === 'ID11QD' || cleanPostcode === 'TEST11AA') {
    console.log('[AddressService] Using dev mock PAF address dataset.');
    return {
      success: true,
      isMock: !apiKey,
      postcode: rawPostcode.toUpperCase(),
      totalAddresses: 3,
      creditsRemaining: INITIAL_TRIAL_CREDITS - creditsUsed,
      addresses: [
        {
          udprn: 'paf_mock_101',
          summary: 'Flat 4, St Johns Court, 14 Maple Close, London, SW1A 1AA',
          line_1: 'Flat 4, St Johns Court',
          line_2: '14 Maple Close',
          post_town: 'LONDON',
          postcode: 'SW1A 1AA',
          building_name: 'St Johns Court',
          sub_building_name: 'Flat 4',
        },
        {
          udprn: 'paf_mock_102',
          summary: 'Flat 5, St Johns Court, 14 Maple Close, London, SW1A 1AA',
          line_1: 'Flat 5, St Johns Court',
          line_2: '14 Maple Close',
          post_town: 'LONDON',
          postcode: 'SW1A 1AA',
          building_name: 'St Johns Court',
          sub_building_name: 'Flat 5',
        },
        {
          udprn: 'paf_mock_103',
          summary: 'House 14, Maple Close, London, SW1A 1AA',
          line_1: '14 Maple Close',
          line_2: '',
          post_town: 'LONDON',
          postcode: 'SW1A 1AA',
          building_name: '',
          sub_building_name: '',
        },
      ],
    };
  }

  const url = `https://api.ideal-postcodes.co.uk/v1/postcodes/${cleanPostcode}?api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.status === 404 || data.code === 4040) {
      return {
        success: false,
        message: `No Royal Mail PAF records found for postcode "${rawPostcode}". Please verify the postcode.`,
        addresses: [],
      };
    }

    if (!response.ok || data.code !== 2000) {
      console.error('[AddressService] Ideal Postcodes API error:', data.message || data.code);
      throw new Error(data.message || 'Postcode lookup failed.');
    }

    creditsUsed += 1;
    const remaining = Math.max(0, INITIAL_TRIAL_CREDITS - creditsUsed);

    if (remaining <= 10) {
      console.warn(`[AddressService] Ideal Postcodes trial credits running low (${remaining}/${INITIAL_TRIAL_CREDITS} remaining).`);
    } else {
      console.log(`[AddressService] Ideal Postcodes lookup successful (${remaining} credits remaining).`);
    }

    const rawList = Array.isArray(data.result) ? data.result : [];
    const formattedAddresses = rawList.map(formatPAFAddressItem);

    return {
      success: true,
      postcode: rawPostcode.toUpperCase(),
      totalAddresses: formattedAddresses.length,
      creditsRemaining: remaining,
      addresses: formattedAddresses,
    };
  } catch (err) {
    console.error('[AddressService] Lookup Exception:', err.message);
    throw err;
  }
}

module.exports = {
  lookupPostcode,
  cleanUKPostcode,
  getApiKey,
};
