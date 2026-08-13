const express = require('express');
const router = express.Router();
const PropertyType = require('../models/propery-types');
const { AgentMiddlware, AdminMiddlware } = require('../middleware');

// Get all property types
router.get('/', async (req, res) => {
    try {
        const types = await PropertyType.findAll();
        res.status(200).json({
            success: true,
            data: types
        });
    } catch (error) {
        console.log('=== error ', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add new property type
router.post('/', AdminMiddlware, async (req, res) => {
    try {
        const { name, status } = req.body;
        const newType = await PropertyType.create({ name, status });
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

// Edit property type
router.put('/:id', AdminMiddlware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;
        const type = await PropertyType.findByPk(id);

        if (!type) {
            return res.status(404).json({
                success: false,
                message: 'Property type not found'
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

// Delete property type
router.delete('/:id', AdminMiddlware, async (req, res) => {
    try {
        const { id } = req.params;
        const type = await PropertyType.findByPk(id);

        if (!type) {
            return res.status(404).json({
                success: false,
                message: 'Property type not found'
            });
        }

        await type.destroy();
        res.status(200).json({
            success: true,
            message: 'Property type deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
