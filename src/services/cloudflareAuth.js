function getAccountId() {
    return (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
}

function getToken(envNames) {
    for (const name of envNames) {
        const value = (process.env[name] || '').trim();
        if (value) return value;
    }
    return '';
}

function buildAuthHeaders(apiToken) {
    const apiEmail = (process.env.CLOUDFLARE_API_EMAIL || '').trim();
    const apiKey = (process.env.CLOUDFLARE_API_KEY || '').trim();

    if (apiToken) {
        return { Authorization: `Bearer ${apiToken}` };
    }

    if (apiEmail && apiKey) {
        return {
            'X-Auth-Email': apiEmail,
            'X-Auth-Key': apiKey,
        };
    }

    return null;
}

function getConfig() {
    return {
        accountId: getAccountId(),
        streamToken: getToken(['CLOUDFLARE_STREAM_TOKEN', 'CLOUDFLARE_API_TOKEN']),
        imagesToken: getToken(['CLOUDFLARE_IMAGES_TOKEN', 'CLOUDFLARE_STREAM_TOKEN', 'CLOUDFLARE_API_TOKEN']),
    };
}

function getStreamAuthHeaders() {
    const { streamToken } = getConfig();
    return buildAuthHeaders(streamToken);
}

function getImagesAuthHeaders() {
    const { imagesToken } = getConfig();
    return buildAuthHeaders(imagesToken);
}

function getAuthHeaders() {
    return getStreamAuthHeaders();
}

function isStreamConfigured() {
    return Boolean(getAccountId() && getStreamAuthHeaders());
}

function isImagesConfigured() {
    return Boolean(getAccountId() && getImagesAuthHeaders());
}

function isConfigured() {
    return isStreamConfigured() || isImagesConfigured();
}

module.exports = {
    getConfig,
    getAuthHeaders,
    getStreamAuthHeaders,
    getImagesAuthHeaders,
    isConfigured,
    isStreamConfigured,
    isImagesConfigured,
};
