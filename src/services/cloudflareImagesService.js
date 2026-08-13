const { getConfig, getImagesAuthHeaders, isImagesConfigured } = require('./cloudflareAuth');

function getImagesApi() {
    const { accountId } = getConfig();
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;
}

function getImageDeliveryUrl(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return null;
    }

    const publicVariant = variants.find((url) => url.includes('/public'));
    return publicVariant || variants[0];
}

function formatImagesError(data) {
    const message = data.errors?.[0]?.message || 'Failed to upload image to Cloudflare';
    const code = data.errors?.[0]?.code;

    if (code === 5403) {
        return (
            'Cloudflare Images is not enabled on this account (error 5403). ' +
            'Go to Cloudflare Dashboard → Images (not Image Resizing) and subscribe/enable the Images product. ' +
            'Then confirm CLOUDFLARE_ACCOUNT_ID matches the account where Images is active.'
        );
    }

    if (code === 10000 || message === 'Authentication error') {
        return (
            'Cloudflare Images authentication failed. Use CLOUDFLARE_IMAGES_TOKEN with Account → Images → Edit permission, ' +
            'or add Images Edit to your existing CLOUDFLARE_STREAM_TOKEN.'
        );
    }

    if (code === 10002 || String(message).toLowerCase().includes('not enabled')) {
        return 'Cloudflare Images is not enabled on this account. Enable it under Billing → Subscriptions.';
    }

    return message;
}

async function uploadImageFile(file) {
    if (!isImagesConfigured()) {
        throw new Error(
            'Cloudflare Images is not configured. Set CLOUDFLARE_IMAGES_TOKEN (or use a token with Images Edit permission).'
        );
    }

    let fileBuffer = file.buffer;
    if (!fileBuffer && file.path && require('fs').existsSync(file.path)) {
        fileBuffer = require('fs').readFileSync(file.path);
    }
    if (!fileBuffer) {
        throw new Error('Image file contains no data buffer or path');
    }

    const authHeaders = getImagesAuthHeaders();
    const formData = new FormData();
    formData.append(
        'file',
        new Blob([fileBuffer], { type: file.mimetype || 'image/jpeg' }),
        file.originalname || file.name || 'photo.jpg'
    );

    console.log('[cloudflare-images] → UPLOAD', file.originalname || 'photo.jpg');

    const response = await fetch(getImagesApi(), {
        method: 'POST',
        headers: authHeaders,
        body: formData,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        console.error('[cloudflare-images] ✗ UPLOAD FAILED', JSON.stringify(data, null, 2));
        throw new Error(formatImagesError(data));
    }

    const deliveryUrl = getImageDeliveryUrl(data.result?.variants);
    if (!deliveryUrl) {
        throw new Error('Cloudflare Images did not return a delivery URL');
    }

    console.log('[cloudflare-images] ✓ UPLOADED', data.result.id);

    return {
        imageId: data.result.id,
        url: deliveryUrl,
    };
}

async function diagnoseImagesSetup() {
    const { accountId, imagesToken } = getConfig();
    const result = {
        configured: isImagesConfigured(),
        configuredAccountId: accountId || null,
        tokenLength: imagesToken.length,
        imagesEnabled: false,
        recommendation: null,
    };

    if (!result.configured) {
        result.recommendation = 'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_IMAGES_TOKEN (or CLOUDFLARE_STREAM_TOKEN with Images Edit).';
        return result;
    }

    try {
        const response = await fetch(getImagesApi(), {
            method: 'GET',
            headers: getImagesAuthHeaders(),
        });
        const data = await response.json();
        result.imagesEnabled = response.ok && data.success === true;

        if (!result.imagesEnabled) {
            const code = data.errors?.[0]?.code;
            result.recommendation = formatImagesError(data);
            if (code === 5403) {
                result.recommendation +=
                    ' Enable Cloudflare Images under Dashboard → Images → Get started (separate from Stream and Image Resizing).';
            }
        } else {
            result.recommendation = 'Cloudflare Images is configured correctly.';
        }
    } catch (error) {
        result.recommendation = `Images check failed: ${error.message}`;
    }

    return result;
}

module.exports = {
    uploadImageFile,
    diagnoseImagesSetup,
    isImagesConfigured,
};
