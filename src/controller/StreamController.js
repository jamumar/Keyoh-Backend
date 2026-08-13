const express = require('express');
const router = express.Router();
const { PropertyOwnerMiddleware } = require('../middleware');
const {
    createDirectUpload,
    getVideoStatus,
    diagnoseStreamSetup,
    VIDEO_LIMITS,
    isConfigured,
} = require('../services/cloudflareStreamService');

router.get('/diagnostics', PropertyOwnerMiddleware, async (req, res) => {
    try {
        const diagnostics = await diagnoseStreamSetup();
        res.status(200).json({ success: true, data: diagnostics });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/direct-upload', PropertyOwnerMiddleware, async (req, res) => {
    try {
        if (!isConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Video upload service is not configured',
            });
        }

        const { videoType } = req.body;
        if (!VIDEO_LIMITS[videoType]) {
            return res.status(400).json({
                success: false,
                message: 'videoType must be property_reel or seller_intro',
            });
        }

        const upload = await createDirectUpload({ videoType });
        res.status(200).json({ success: true, data: upload });
    } catch (error) {
        console.error('[stream] direct-upload failed:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:streamId/status', PropertyOwnerMiddleware, async (req, res) => {
    try {
        if (!isConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Video upload service is not configured',
            });
        }

        const status = await getVideoStatus(req.params.streamId);
        res.status(200).json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
