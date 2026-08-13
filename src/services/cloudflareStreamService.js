const https = require('https');
const fs = require('fs');
const { getConfig, getStreamAuthHeaders, isStreamConfigured } = require('./cloudflareAuth');

function getStreamApi(accountId) {
    const { accountId: configuredAccountId } = getConfig();
    return `https://api.cloudflare.com/client/v4/accounts/${accountId || configuredAccountId}/stream`;
}

function getPlaybackUrl(streamId) {
    return `https://videodelivery.net/${streamId}/manifest/video.m3u8`;
}

function getThumbnailUrl(streamId) {
    return `https://videodelivery.net/${streamId}/thumbnails/thumbnail.jpg`;
}

const jwt = require('jsonwebtoken');

const VIDEO_LIMITS = {
    property_reel: 120, // 2 minutes property walkthrough
    seller_intro: 30,   // 30 seconds seller intro
};

function generateSignedPlaybackUrl(streamId, expiresInSeconds = 3600) {
    const keyId = process.env.CLOUDFLARE_STREAM_KEY_ID;
    const privateKey = process.env.CLOUDFLARE_STREAM_PRIVATE_KEY;
    const tokenSecret = process.env.CLOUDFLARE_STREAM_TOKEN_SECRET || process.env.SELLER_TOKEN_STRING || 'keyoh_secret_stream_2026';

    if (keyId && privateKey) {
        try {
            const formattedKey = privateKey.replace(/\\n/g, '\n');
            const token = jwt.sign(
                { sub: streamId, kid: keyId },
                formattedKey,
                { algorithm: 'RS256', expiresIn: expiresInSeconds }
            );
            return `https://videodelivery.net/${token}/manifest/video.m3u8`;
        } catch (err) {
            console.warn('[cloudflare] RS256 token signing failed, falling back:', err.message);
        }
    }

    // Standard playback URL or HMAC fallback
    return `https://videodelivery.net/${streamId}/manifest/video.m3u8`;
}

async function createTusUploadUrl({ videoType, propertyId }) {
    if (!isStreamConfigured()) {
        throw new Error('Cloudflare Stream is not configured');
    }

    const { accountId } = getConfig();
    const maxDurationSeconds = VIDEO_LIMITS[videoType];
    if (!maxDurationSeconds) {
        throw new Error(`Invalid video type: ${videoType}`);
    }

    const requireSignedURLs = process.env.REQUIRE_SIGNED_URLS === 'true' && Boolean(process.env.CLOUDFLARE_STREAM_PRIVATE_KEY && process.env.CLOUDFLARE_STREAM_KEY_ID);

    const { response, data } = await cloudflareRequest(
        `${getStreamApi(accountId)}/direct_upload`,
        {
            method: 'POST',
            body: JSON.stringify({
                maxDurationSeconds,
                requireSignedURLs,
                allowedOrigins: ['*'],
                meta: {
                    videoType,
                    propertyId: propertyId ? String(propertyId) : undefined,
                },
            }),
        }
    );

    if (!response.ok || !data.success) {
        throw new Error(formatCloudflareError(data, accountId));
    }

    const { uploadURL, uid } = data.result;
    return {
        uploadURL,
        streamId: uid,
        playbackUrl: generateSignedPlaybackUrl(uid),
        thumbnailUrl: getThumbnailUrl(uid),
        maxDurationSeconds,
    };
}

module.exports = {
    VIDEO_LIMITS,
    createDirectUpload,
    createTusUploadUrl,
    uploadVideoFile,
    getVideoStatus,
    getPlaybackUrl,
    generateSignedPlaybackUrl,
    diagnoseStreamSetup,
    isConfigured: isStreamConfigured,
    isStreamConfigured,
    removeTempFile,
};

function maskAuthHeader(headers) {
    const safe = { ...headers };
    if (safe.Authorization) {
        const token = safe.Authorization.replace(/^Bearer\s+/i, '');
        safe.Authorization = `Bearer ${token.slice(0, 12)}... (${token.length} chars)`;
    }
    if (safe['X-Auth-Key']) {
        safe['X-Auth-Key'] = '***redacted***';
    }
    return safe;
}

function logCloudflareRequest(method, url, headers, body) {
    console.log('[cloudflare] → REQUEST');
    console.log('[cloudflare]   method:', method);
    console.log('[cloudflare]   url:', url);
    console.log('[cloudflare]   headers:', maskAuthHeader(headers));
    if (body) {
        console.log('[cloudflare]   body:', body);
    }
}

function logCloudflareResponse(method, url, statusCode, data) {
    console.log('[cloudflare] ← RESPONSE');
    console.log('[cloudflare]   method:', method);
    console.log('[cloudflare]   url:', url);
    console.log('[cloudflare]   status:', statusCode);
    console.log('[cloudflare]   data:', JSON.stringify(data, null, 2));
}

function cloudflareRequest(url, options = {}) {
    const authHeaders = getStreamAuthHeaders();
    if (!authHeaders) {
        return Promise.reject(new Error('Cloudflare Stream is not configured'));
    }

    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ?? null;
    const parsedUrl = new URL(url);

    const headers = {
        Accept: 'application/json',
        ...authHeaders,
        ...(options.headers || {}),
    };

    if (body) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(body);
    }

    logCloudflareRequest(method, url, headers, body);

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: parsedUrl.hostname,
                path: `${parsedUrl.pathname}${parsedUrl.search}`,
                method,
                headers,
            },
            (res) => {
                let raw = '';
                res.on('data', (chunk) => {
                    raw += chunk;
                });
                res.on('end', () => {
                    let data = {};
                    try {
                        data = raw ? JSON.parse(raw) : {};
                    } catch (error) {
                        logCloudflareResponse(method, url, res.statusCode, { parseError: raw });
                        return reject(new Error('Invalid Cloudflare API response'));
                    }

                    logCloudflareResponse(method, url, res.statusCode, data);

                    resolve({
                        response: {
                            ok: res.statusCode >= 200 && res.statusCode < 300,
                            status: res.statusCode,
                        },
                        data,
                    });
                });
            }
        );

        req.on('error', (error) => {
            console.error('[cloudflare] ✗ REQUEST ERROR', method, url, error.message);
            reject(error);
        });
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

function isTokenVerifySuccess(data) {
    return (
        data.success === true ||
        data.result?.status === 'active' ||
        data.messages?.some((message) =>
            String(message.message || '').toLowerCase().includes('valid')
        )
    );
}

function formatCloudflareError(data, accountId) {
    const message = data.errors?.[0]?.message || 'Failed to create Cloudflare Stream upload URL';
    const code = data.errors?.[0]?.code;

    if (message === 'Authentication error' || code === 10000) {
        const { streamToken } = getConfig();
        return (
            'Cloudflare authentication failed. Check that CLOUDFLARE_STREAM_TOKEN in .env is the ' +
            `full token from Postman (current length: ${streamToken.length} chars). ` +
            'Also confirm Account ID from Stream dashboard and Stream Edit permission.'
        );
    }

    if (code === 10002) {
        return 'Cloudflare Stream is not enabled on this account. Enable Stream under Billing → Subscriptions, or submit without videos.';
    }

    return message;
}

async function uploadVideoFile(file, videoType) {
    if (!isStreamConfigured()) {
        throw new Error('Cloudflare Stream is not configured');
    }

    if (!VIDEO_LIMITS[videoType]) {
        throw new Error(`Invalid video type: ${videoType}`);
    }

    const { uploadURL, streamId, playbackUrl, thumbnailUrl } = await createDirectUpload({
        videoType,
    });

    const fileBuffer = file.buffer || fs.readFileSync(file.path);
    const formData = new FormData();
    formData.append(
        'file',
        new Blob([fileBuffer], { type: file.mimetype || 'video/mp4' }),
        file.originalname || `${videoType}.mp4`
    );

    console.log('[cloudflare] → UPLOAD VIDEO FILE', videoType, file.originalname);
    const uploadResponse = await fetch(uploadURL, {
        method: 'POST',
        body: formData,
    });

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('[cloudflare] ✗ VIDEO FILE UPLOAD FAILED', uploadResponse.status, errorText);
        throw new Error('Failed to upload video file to Cloudflare Stream');
    }

    console.log('[cloudflare] ✓ VIDEO UPLOADED TO STREAM', streamId);

    return {
        type: videoType,
        streamId,
        url: playbackUrl,
        playbackUrl,
        thumbnailUrl,
    };
}

function removeTempFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.warn('[upload] Could not remove temp file:', filePath);
    }
}

async function diagnoseStreamSetup() {
    const { accountId, streamToken } = getConfig();
    const result = {
        configured: isStreamConfigured(),
        configuredAccountId: accountId || null,
        tokenLength: streamToken.length,
        tokenValid: false,
        accessibleAccounts: [],
        accountIdMatches: false,
        streamAccess: false,
        directUploadWorks: false,
        recommendation: null,
    };

    if (!result.configured) {
        result.recommendation = 'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_TOKEN in .env';
        return result;
    }

    try {
        const { response, data } = await cloudflareRequest(
            'https://api.cloudflare.com/client/v4/user/tokens/verify',
            { method: 'GET' }
        );
        result.tokenValid = response.ok && isTokenVerifySuccess(data);
        if (!result.tokenValid) {
            result.recommendation =
                `Token verify returned HTTP ${response.status}. ` +
                'Copy the complete token from Postman into .env — partial tokens cause 401 errors.';
            return result;
        }
    } catch (error) {
        result.recommendation = `Token verify failed: ${error.message}`;
        return result;
    }

    try {
        const { data: accountsData } = await cloudflareRequest(
            'https://api.cloudflare.com/client/v4/accounts',
            { method: 'GET' }
        );
        if (accountsData.success && Array.isArray(accountsData.result)) {
            result.accessibleAccounts = accountsData.result.map((account) => ({
                id: account.id,
                name: account.name,
            }));
            result.accountIdMatches = result.accessibleAccounts.some(
                (account) => account.id === accountId
            );
        }
    } catch (error) {
        result.recommendation = `Could not list accounts: ${error.message}`;
    }

    if (!result.accountIdMatches && result.accessibleAccounts.length > 0) {
        result.recommendation =
            `CLOUDFLARE_ACCOUNT_ID is wrong. Your token can access: ` +
            result.accessibleAccounts.map((a) => `${a.name} (${a.id})`).join(', ') +
            `. Update .env with the correct Account ID from Stream dashboard.`;
        return result;
    }

    try {
        const { response, data } = await cloudflareRequest(getStreamApi(accountId), {
            method: 'GET',
        });
        result.streamAccess = response.ok && data.success === true;
    } catch (error) {
        result.recommendation = `Stream list failed: ${error.message}`;
    }

    try {
        const { response, data } = await cloudflareRequest(
            `${getStreamApi(accountId)}/direct_upload`,
            {
                method: 'POST',
                body: JSON.stringify({ maxDurationSeconds: 20 }),
            }
        );
        result.directUploadWorks = response.ok && data.success === true;
        if (!result.directUploadWorks) {
            result.recommendation = formatCloudflareError(data, accountId);
        }
    } catch (error) {
        result.recommendation = `Direct upload test failed: ${error.message}`;
    }

    if (result.directUploadWorks) {
        result.recommendation = 'Cloudflare Stream is configured correctly.';
    }

    return result;
}

async function createDirectUpload({ videoType, propertyId }) {
    if (!isStreamConfigured()) {
        throw new Error('Cloudflare Stream is not configured');
    }

    const { accountId } = getConfig();
    const maxDurationSeconds = VIDEO_LIMITS[videoType];
    if (!maxDurationSeconds) {
        throw new Error(`Invalid video type: ${videoType}`);
    }

    const requireSignedURLs = process.env.REQUIRE_SIGNED_URLS === 'true';
    const rawOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
      : ['*'];

    const allowedOrigins = rawOrigins
      .map(o => o.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:.*$/, '').trim())
      .filter(o => o && o.length > 0 && o.includes('.'));

    const finalAllowedOrigins = allowedOrigins.length > 0 ? allowedOrigins : ['*'];

    const { response, data } = await cloudflareRequest(
        `${getStreamApi(accountId)}/direct_upload`,
        {
            method: 'POST',
            body: JSON.stringify({
                maxDurationSeconds,
                requireSignedURLs,
                allowedOrigins: finalAllowedOrigins,
                meta: {
                    videoType,
                    propertyId: propertyId ? String(propertyId) : undefined,
                },
            }),
        }
    );

    if (!response.ok || !data.success) {
        throw new Error(formatCloudflareError(data, accountId));
    }

    const { uploadURL, uid } = data.result;
    return {
        uploadURL,
        streamId: uid,
        playbackUrl: getPlaybackUrl(uid),
        thumbnailUrl: getThumbnailUrl(uid),
        maxDurationSeconds,
    };
}

async function getVideoStatus(streamId) {
    if (!isStreamConfigured()) {
        throw new Error('Cloudflare Stream is not configured');
    }

    const { accountId } = getConfig();
    const { response, data } = await cloudflareRequest(
        `${getStreamApi(accountId)}/${streamId}`,
        { method: 'GET' }
    );

    if (!response.ok || !data.success) {
        const message = data.errors?.[0]?.message || 'Failed to fetch video status';
        throw new Error(message);
    }

    const video = data.result;
    return {
        streamId: video.uid,
        ready: video.readyToStream,
        status: video.status?.state,
        duration: video.duration,
        playbackUrl: getPlaybackUrl(video.uid),
        thumbnailUrl: getThumbnailUrl(video.uid),
    };
}

module.exports = {
    VIDEO_LIMITS,
    createDirectUpload,
    createTusUploadUrl,
    generateSignedPlaybackUrl,
    uploadVideoFile,
    getVideoStatus,
    getPlaybackUrl,
    diagnoseStreamSetup,
    isConfigured: isStreamConfigured,
    isStreamConfigured,
    removeTempFile,
};
