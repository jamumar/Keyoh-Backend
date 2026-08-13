const express = require('express');
const router = express.Router();
const { AgentMiddlware } = require('../middleware');
const { diagnoseImagesSetup } = require('../services/cloudflareImagesService');

router.get('/diagnostics', AgentMiddlware, async (req, res) => {
    try {
        const diagnostics = await diagnoseImagesSetup();
        res.status(200).json({ success: true, data: diagnostics });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
