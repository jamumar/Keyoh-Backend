const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ChatAuthMiddleware } = require('../middleware');
const { Properties } = require('../models');
const {
    VIDEO_LIMITS,
    createTusUploadUrl,
    generateSignedPlaybackUrl,
    getVideoStatus,
} = require('../services/cloudflareStreamService');

// Request direct TUS upload URL (Walkthrough: 120s, Seller Intro: 30s)
router.post('/upload-url', ChatAuthMiddleware, async (req, res) => {
    try {
        const { videoType, propertyId } = req.body;
        const targetType = videoType || 'property_reel';

        if (!VIDEO_LIMITS[targetType]) {
            return res.status(400).json({
                success: false,
                message: `Invalid video type '${targetType}'. Allowed: property_reel (120s), seller_intro (30s)`,
            });
        }

        const uploadData = await createTusUploadUrl({
            videoType: targetType,
            propertyId,
        });

        return res.status(200).json({
            success: true,
            data: {
                uploadURL: uploadData.uploadURL,
                streamId: uploadData.streamId,
                playbackUrl: uploadData.playbackUrl,
                thumbnailUrl: uploadData.thumbnailUrl,
                maxDurationSeconds: uploadData.maxDurationSeconds,
                videoType: targetType,
            },
        });
    } catch (error) {
        console.error('[videoController] Direct upload URL creation failed:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// Request signed playback URL token for a specific Cloudflare Stream video ID
router.get('/playback-token/:streamId', ChatAuthMiddleware, async (req, res) => {
    try {
        const { streamId } = req.params;
        if (!streamId) {
            return res.status(400).json({
                success: false,
                message: 'streamId is required',
            });
        }

        const playbackUrl = generateSignedPlaybackUrl(streamId, 3600); // 1 hour token
        return res.status(200).json({
            success: true,
            data: {
                streamId,
                playbackUrl,
            },
        });
    } catch (error) {
        console.error('[videoController] Playback token generation error:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// Cloudflare Stream Webhook Receiver with HMAC SHA-256 verification
router.post('/webhooks/cloudflare-stream', async (req, res) => {
    try {
        const webhookSecret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
        const signatureHeader = req.headers['webhook-signature'];

        if (webhookSecret && signatureHeader) {
            // Verify HMAC signature
            const parts = signatureHeader.split(',').reduce((acc, curr) => {
                const [k, v] = curr.trim().split('=');
                if (k && v) acc[k] = v;
                return acc;
            }, {});

            const time = parts.time || parts.t;
            const sig = parts.sig1 || parts.s;

            if (time && sig) {
                const bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
                const payload = `${time}.${bodyText}`;
                const expectedSig = crypto
                    .createHmac('sha256', webhookSecret)
                    .update(payload)
                    .digest('hex');

                if (expectedSig !== sig) {
                    console.warn('[webhook] ⚠️ Invalid Cloudflare webhook signature');
                    return res.status(401).json({ success: false, message: 'Invalid signature' });
                }
            }
        }

        const body = req.body || {};
        const streamId = body.uid || body.result?.uid;
        const status = body.status?.state || body.result?.status?.state;

        console.log(`[webhook] 🔔 Cloudflare Stream webhook received for ${streamId}: status=${status}`);

        if (streamId && (status === 'ready' || status === 'completed')) {
            // Find properties containing this streamId in their videos JSON
            const properties = await Properties.findAll();
            for (const prop of properties) {
                let vids = typeof prop.videos === 'string' ? JSON.parse(prop.videos) : (prop.videos || []);
                if (Array.isArray(vids) && vids.some(v => v.streamId === streamId || v.url?.includes(streamId))) {
                    await prop.update({ status: 'available', moderation_status: 'clean' });
                    console.log(`[webhook] 🎉 Property #${prop.id} set to AVAILABLE after video ready confirmation!`);
                }
            }
        } else if (streamId && status === 'error') {
            console.error(`[webhook] ❌ Video ${streamId} encoding returned error from Cloudflare Stream`);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[webhook] Webhook processing error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
