const express = require('express');
const router = express.Router();
const TenureType = require('../models/tenure-types');
const { AdminMiddlware } = require('../middleware');

// Get all tenure types
router.get('/', async (req, res) => {
    try {
        const types = await TenureType.findAll();
        res.status(200).json({
            success: true,
            data: types
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add new tenure type
router.post('/', AdminMiddlware, async (req, res) => {
    try {
        const { name, status } = req.body;
        const newType = await TenureType.create({ name, status });
        res.status(201).json({
            success: true,
            data: newType
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Edit tenure type
router.put('/:id', AdminMiddlware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;
        const type = await TenureType.findByPk(id);

        if (!type) {
            return res.status(404).json({
                success: false,
                message: 'Tenure type not found'
            });
        }

        await type.update({ name, status });
        res.status(200).json({
            success: true,
            data: type
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Delete tenure type
router.delete('/:id', AdminMiddlware, async (req, res) => {
    try {
        const { id } = req.params;
        const type = await TenureType.findByPk(id);

        if (!type) {
            return res.status(404).json({
                success: false,
                message: 'Tenure type not found'
            });
        }

        await type.destroy();
        res.status(200).json({
            success: true,
            message: 'Tenure type deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
