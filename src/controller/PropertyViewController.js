

const express = require('express');
const router = express.Router();
const PropertyView = require('../models/property-views');
const { sequelize } = require('../lib/db');
const Properties = require('../models/properties');
const { CustomerMiddleware } = require('../middleware');

router.get('/', CustomerMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const propertyView = await PropertyView.findAll({
            where: {
                user_id: userId,
            },
        });

        res.status(200).json({
            success: true,
            data: propertyView,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post('/', CustomerMiddleware, async (req, res) => {
    let transaction;

    try {
        const { property_id } = req.body;
        const userId = req.user.id;

        if (!property_id) {
            return res.status(400).json({
                success: false,
                message: 'Property ID is required',
            });
        }

        const existingView = await PropertyView.findOne({
            where: {
                property_id,
                user_id: userId,
            },
        });

        if (existingView) {
            return res.status(200).json({
                success: true,
                message: 'View already recorded',
            });
        }

        transaction = await sequelize.transaction();

        await PropertyView.create({
            property_id,
            user_id: userId,
        }, { transaction });

        await Properties.increment('view_count', {
            by: 1,
            where: {
                id: property_id,
            },
            transaction,
        });

        await transaction.commit();
        transaction = null;

        res.status(200).json({
            success: true,
        });
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }

        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

module.exports = router;
