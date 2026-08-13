const express = require('express');
const router = express.Router();
const { SellerAuthMiddleware } = require('../middleware');
const { getSellerDashboardStats } = require('../services/sellerStatsService');
const {
    createHandoverRequest,
    getSellerHandover,
    cancelHandover,
} = require('../services/handoverService');
const { Properties, UserBillings } = require('../models');
const User = require('../models/users');
const { sendEmail, buildBoostPurchaseEmail } = require('../services/emailService');

const BOOST_TIER_MAP = {
    seen: 'SEEN',
    trending: 'TRENDING',
    prime: 'PRIME',
    boost: 'PRIME',
};

const BOOST_TIER_DETAILS = {
    boost: {
        label: 'BOOST LISTING',
        price: '£29',
        description: 'Places your listing in top scroll row and priority feed for 30 days',
    },
    seen: {
        label: 'SEEN',
        price: '£79',
        description: 'More visibility in the feed',
    },
    trending: {
        label: 'TRENDING',
        price: '£199',
        description: 'Featured in trending homes',
    },
    prime: {
        label: 'PRIME',
        price: '£499',
        description: 'Top of the feed for 7 days',
    },
};

router.get('/dashboard-stats', SellerAuthMiddleware, async (req, res) => {
    try {
        const data = await getSellerDashboardStats(req.user.id);

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// Apply a boost to the seller's listing after a successful RevenueCat purchase
router.post('/boost', SellerAuthMiddleware, async (req, res) => {
    try {
        const sellerId = req.user.id;
        const { tier, property_id, billing } = req.body;

        const tierKey = String(tier || '').toLowerCase();
        const boostValue = BOOST_TIER_MAP[tierKey];
        if (!boostValue) {
            return res.status(400).json({
                success: false,
                message: 'Invalid boost tier. Must be boost, seen, trending, or prime.',
            });
        }

        const where = { agent_id: sellerId };
        if (property_id) {
            where.id = property_id;
        }

        const property = await Properties.findOne({
            where,
            order: [['createdAt', 'DESC']],
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'No listing found to boost.',
            });
        }

        property.boost = boostValue;
        await property.save();

        if (billing && billing.revenueCatAppUserId && billing.productId) {
            try {
                await UserBillings.create({
                    user_id: sellerId,
                    revenue_cat_app_user_id: billing.revenueCatAppUserId,
                    product_id: billing.productId,
                    package_id: billing.packageId || null,
                    offering_id: billing.offeringId || null,
                    entitlement_id: billing.entitlementId || null,
                    billing_period: billing.billingPeriod === 'monthly' ? 'monthly' : 'annual',
                    status: billing.status === 'trialing' ? 'trialing' : 'active',
                    start_date: billing.startDate ? new Date(billing.startDate) : new Date(),
                    expire_date: billing.expireDate ? new Date(billing.expireDate) : null,
                    will_renew: billing.willRenew ?? false,
                    store: billing.store || 'unknown',
                    is_trial: billing.isTrial ?? false,
                });
            } catch (billingError) {
                console.error('[seller/boost] Failed to record billing:', billingError.message);
            }
        }

        const tierDetails = BOOST_TIER_DETAILS[tierKey];
        const seller = await User.findByPk(sellerId, { attributes: ['name', 'email'] });
        if (seller?.email && tierDetails) {
            const boostEmail = buildBoostPurchaseEmail({
                name: seller.name,
                tierLabel: tierDetails.label,
                price: tierDetails.price,
                description: tierDetails.description,
                propertyAddress: property.address,
            });
            sendEmail({
                to: seller.email.trim().toLowerCase(),
                subject: boostEmail.subject,
                html: boostEmail.html,
                text: boostEmail.text,
            }).catch((emailError) => {
                console.error('[seller/boost] confirmation email failed:', emailError.message);
            });
        }

        res.status(200).json({
            success: true,
            data: {
                property_id: property.id,
                boost: property.boost,
                active_boost: String(boostValue).toLowerCase(),
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post('/handover', SellerAuthMiddleware, async (req, res) => {
    try {
        const { agent_name, agent_email } = req.body;
        const handover = await createHandoverRequest({
            sellerId: req.user.id,
            agentName: agent_name,
            agentEmail: agent_email,
        });

        res.status(200).json({
            success: true,
            data: { handover },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

router.get('/handover', SellerAuthMiddleware, async (req, res) => {
    try {
        const handover = await getSellerHandover(req.user.id);

        res.status(200).json({
            success: true,
            data: { handover },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

router.delete('/handover/:id', SellerAuthMiddleware, async (req, res) => {
    try {
        const handover = await cancelHandover({
            handoverId: req.params.id,
            sellerId: req.user.id,
        });

        res.status(200).json({
            success: true,
            data: { handover },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post('/videographer-request', SellerAuthMiddleware, async (req, res) => {
    try {
        const { property_id, requested_date, preferred_time, notes, contact_phone } = req.body;
        if (!requested_date) {
            return res.status(400).json({ success: false, message: 'Requested date is required.' });
        }

        const { VideographerRequests } = require('../models');
        const request = await VideographerRequests.create({
            seller_id: req.user.id,
            property_id: property_id || null,
            requested_date,
            preferred_time: preferred_time || 'Morning',
            notes: notes || '',
            contact_phone: contact_phone || '',
            status: 'pending',
        });

        try {
            const seller = await User.findByPk(req.user.id, { attributes: ['name', 'email'] });
            if (seller?.email) {
                sendEmail({
                    to: seller.email.trim().toLowerCase(),
                    subject: 'KEYOH — Videographer Booking Request Received',
                    html: `<p>Hi ${seller.name || 'Seller'},</p><p>We received your videographer booking request for <strong>${requested_date} (${preferred_time || 'Flexible'})</strong>. A certified KEYOH property videographer will contact you shortly.</p>`,
                    text: `Videographer request received for ${requested_date}`,
                }).catch(() => {});
            }
        } catch (e) {
            console.error('[videographer-request] Email dispatch error:', e.message);
        }

        res.status(200).json({
            success: true,
            data: { request },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
