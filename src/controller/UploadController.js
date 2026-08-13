const express = require('express');
const router = express.Router();
const upload = require('../utils/upload');
const { AgentMiddlware } = require('../middleware');

// Route for single file upload
router.post('/single', AgentMiddlware, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const fileUrl = `${req.protocol}://${req.get('host')}/public/uploads/${req.file.filename}`;
        res.status(200).json({
            success: true,
            url: fileUrl
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Route for multiple files upload
router.post('/multiple', AgentMiddlware, upload.array('images', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const fileUrls = req.files.map(file => `${req.protocol}://${req.get('host')}/public/uploads/${file.filename}`);
        res.status(200).json({
            success: true,
            urls: fileUrls
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
