const express = require('express');
const router = express.Router();
const Saves = require('../models/saves');
const { CustomerMiddleware } = require('../middleware');
const Properties = require('../models/properties');
const { sequelize } = require('../lib/db');
const { Op } = require('sequelize');
const { TenureType, Users, PropertyType } = require('../models');

const getUserSaves = (userId) => Saves.findAll({
    where: {
        user_id: userId,
    },
    include: [
        {
            model: Properties,
            as: 'propertyLike',
            include: [
                {
                    model: PropertyType,
                    as: 'propertyType',
                    attributes: ['id', 'name', 'status'],
                },
                {
                    model: TenureType,
                    as: 'tenureType',
                    attributes: ['id', 'name', 'status'],
                },
                {
                    model: Users,
                    as: 'agentProperties',
                    attributes: ['id', 'name', 'email', 'phone', 'agency_name'],
                },
            ],
        },
    ],
});

router.get('/', CustomerMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const saves = await getUserSaves(userId);

        res.status(200).json({
            success: true,
            data: saves,
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

        const targetProperty = await Properties.findByPk(property_id);
        if (!targetProperty) {
            return res.status(404).json({
                success: false,
                message: 'Property not found',
            });
        }

        const existingSave = await Saves.findOne({
            where: {
                property_id,
                user_id: userId,
            },
        });

        if (existingSave) {
            const saves = await getUserSaves(userId);
            return res.status(200).json({
                success: true,
                message: 'Property already saved',
                data: saves,
            });
        }

        transaction = await sequelize.transaction();

        await Saves.create({
            property_id,
            user_id: userId,
        }, {
            transaction,
        });

        await Properties.increment('like_count', {
            by: 1,
            where: {
                id: property_id,
            },
            transaction,
        });

        await transaction.commit();
        transaction = null;

        const saves = await getUserSaves(userId);

        res.status(200).json({
            success: true,
            message: 'Property saved successfully',
            data: saves,
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

router.delete('/:id', CustomerMiddleware, async (req, res) => {
    let transaction;

    try {
        const targetId = req.params.id;
        const userId = req.user.id;

        const existingSave = await Saves.findOne({
            where: {
                user_id: userId,
                [Op.or]: [
                    { id: targetId },
                    { property_id: targetId },
                ],
            },
        });

        if (!existingSave) {
            return res.status(404).json({
                success: false,
                message: 'Property not found in your saves',
            });
        }

        transaction = await sequelize.transaction();

        await existingSave.destroy({
            transaction,
        });

        await Properties.decrement('like_count', {
            by: 1,
            where: {
                id: existingSave.property_id,
            },
            transaction,
        });

        await transaction.commit();
        transaction = null;

        const saves = await getUserSaves(userId);

        res.status(200).json({
            success: true,
            data: saves,
            message: 'Property removed from saves successfully',
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
