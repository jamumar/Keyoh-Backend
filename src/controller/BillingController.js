const express = require('express');
const router = express.Router();
const { Properties, Users, UserBillings } = require('../models');
const { Op } = require('sequelize');
const { ChatAuthMiddleware } = require('../middleware');
const { sendBoostActivePushNotification } = require('../services/pushNotificationService');

// Official Standard Product Mapping Matrix
const PRODUCT_CATALOG = {
  'keyoh_seller_listing_tier1': {
    type: 'listing_fee',
    tier: 'tier1',
    amountPence: 19900,
    priceStr: '£199.00',
    name: 'Seller Listing Fee (Under £250k)',
    entitlement: 'seller_listing',
    period: 'one_time',
  },
  'keyoh_seller_listing_tier2': {
    type: 'listing_fee',
    tier: 'tier2',
    amountPence: 29900,
    priceStr: '£299.00',
    name: 'Seller Listing Fee (£250k – £500k)',
    entitlement: 'seller_listing',
    period: 'one_time',
  },
  'keyoh_seller_listing_tier3': {
    type: 'listing_fee',
    tier: 'tier3',
    amountPence: 39900,
    priceStr: '£399.00',
    name: 'Seller Listing Fee (Over £500k)',
    entitlement: 'seller_listing',
    period: 'one_time',
  },
  'keyoh_property_listing_fee': {
    type: 'listing_fee',
    tier: 'standard',
    amountPence: 19900,
    priceStr: '£199.00',
    name: 'Seller Property Listing Fee',
    entitlement: 'seller_listing',
    period: 'one_time',
  },
  'keyoh_property_boost_monthly': {
    type: 'boost',
    tier: 'PRIME',
    amountPence: 2900,
    priceStr: '£29.00',
    name: 'Property 30-Day Feed Boost',
    entitlement: 'property_boost',
    period: 'monthly',
  },
  'keyoh_agent_subscription_annual': {
    type: 'agent_subscription',
    tier: 'annual',
    amountPence: 29900,
    priceStr: '£299.00',
    name: 'Estate Agent Annual Membership',
    entitlement: 'agent_subscription',
    period: 'annual',
  },
};

// Fallback lookup helper for legacy or custom product strings
function getProductInfo(productId) {
  if (!productId) return PRODUCT_CATALOG['keyoh_property_boost_monthly'];
  const cleanId = String(productId).toLowerCase();

  if (PRODUCT_CATALOG[cleanId]) return PRODUCT_CATALOG[cleanId];
  if (cleanId.includes('199') || cleanId.includes('tier1')) return PRODUCT_CATALOG['keyoh_seller_listing_tier1'];
  if (cleanId.includes('299') && cleanId.includes('agent')) return PRODUCT_CATALOG['keyoh_agent_subscription_annual'];
  if (cleanId.includes('299') || cleanId.includes('tier2')) return PRODUCT_CATALOG['keyoh_seller_listing_tier2'];
  if (cleanId.includes('399') || cleanId.includes('tier3')) return PRODUCT_CATALOG['keyoh_seller_listing_tier3'];
  if (cleanId.includes('29') || cleanId.includes('boost')) return PRODUCT_CATALOG['keyoh_property_boost_monthly'];

  return PRODUCT_CATALOG['keyoh_property_boost_monthly'];
}

// 1. Process User Purchase (Mobile App In-App Purchase Sync)
router.post('/purchase', ChatAuthMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { productId, propertyId, store = 'app_store' } = req.body;

    const info = getProductInfo(productId);
    const user = await Users.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    // Ownership validation for property-tied purchases (Listing fee & Boosts)
    let targetProp = null;
    if (propertyId) {
      targetProp = await Properties.findByPk(propertyId);
      if (targetProp && targetProp.agent_id !== userId && user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: You can only purchase listings or boosts for your own properties.',
        });
      }
    }

    // Deduplication check: Prevent duplicate billing records within a 3-minute window
    const recentBilling = await UserBillings.findOne({
      where: {
        user_id: userId,
        product_id: productId || 'keyoh_property_boost_monthly',
        status: 'active',
        createdAt: {
          [Op.gt]: new Date(Date.now() - 3 * 60 * 1000),
        },
      },
      order: [['createdAt', 'DESC']],
    });

    if (recentBilling && info.type === 'listing_fee') {
      console.log(`[Billing] Deduplication hit for User #${userId} on product ${productId}`);
      return res.status(200).json({
        success: true,
        message: `Active purchase already recorded for ${info.name}`,
        data: {
          product: info,
          billing: recentBilling,
          property: targetProp,
        },
      });
    }

    let updatedProperty = null;
    let expireDate = null;

    if (info.type === 'listing_fee') {
      if (targetProp && targetProp.status !== 'sold') {
        targetProp.status = 'available';
        targetProp.verified = true;
        await targetProp.save();
        updatedProperty = targetProp;
      }
    } else if (info.type === 'boost') {
      if (!targetProp) {
        targetProp = await Properties.findOne({
          where: { agent_id: userId },
          order: [['createdAt', 'DESC']],
        });
      }

      if (targetProp) {
        targetProp.boost = 'PRIME';
        await targetProp.save();
        updatedProperty = targetProp;
      }
      expireDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (info.type === 'agent_subscription') {
      expireDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      user.role = 'agent';
      await user.save();
    }

    // Record billing history entry
    const billingRecord = await UserBillings.create({
      user_id: userId,
      revenue_cat_app_user_id: `rc_user_${userId}`,
      product_id: productId || 'keyoh_property_boost_monthly',
      package_id: info.type,
      offering_id: 'default',
      entitlement_id: info.entitlement,
      billing_period: info.period,
      status: 'active',
      start_date: new Date(),
      expire_date: expireDate,
      will_renew: info.period !== 'one_time',
      store: store || 'app_store',
    });

    console.log(`💳 [BILLING] User #${userId} purchased ${info.name} (${info.priceStr})`);

    if (info.type === 'boost') {
      sendBoostActivePushNotification({
        recipientId: userId,
        propertyAddress: updatedProperty?.address,
      }).catch((pErr) => console.error('[BillingController] Push dispatch error:', pErr.message));
    }

    return res.status(200).json({
      success: true,
      message: `Successfully purchased ${info.name}`,
      data: {
        product: info,
        billing: billingRecord,
        property: updatedProperty,
      },
    });
  } catch (error) {
    console.error('[billing:error]', error.message);
    return res.status(500).json({ success: false, message: 'Billing transaction processing error.' });
  }
});

// 2. RevenueCat Live & Sandbox Webhook Listener
router.post('/revenuecat', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    
    // In production, require configured webhook secret. In dev/sandbox, validate when provided.
    if (webhookSecret) {
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return res.status(401).json({ success: false, message: 'Invalid RevenueCat webhook signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ success: false, message: 'Webhook secret is not configured' });
    }

    const event = req.body?.event || req.body;
    if (!event) {
      return res.status(400).json({ success: false, message: 'Missing event payload' });
    }

    const { type, app_user_id, product_id, store } = event;
    const userId = parseInt(app_user_id, 10) || 1;
    const info = getProductInfo(product_id);

    console.log(`[billing:revenuecat] Event: ${type} | User: #${userId} | Product: ${product_id}`);

    // Update MySQL property / user status based on RevenueCat entitlement
    if (info.type === 'boost') {
      const property = await Properties.findOne({
        where: { agent_id: userId },
        order: [['createdAt', 'DESC']],
      });
      if (property) {
        property.boost = 'PRIME';
        await property.save();
      }
    } else if (info.type === 'listing_fee') {
      const property = await Properties.findOne({
        where: { agent_id: userId },
        order: [['createdAt', 'DESC']],
      });
      if (property) {
        property.status = 'available';
        await property.save();
      }
    } else if (info.type === 'agent_subscription') {
      const user = await Users.findByPk(userId);
      if (user) {
        user.role = 'agent';
        await user.save();
      }
    }

    // Save transaction in user_billings if valid user exists
    const validUser = await Users.findByPk(userId);
    if (validUser) {
      await UserBillings.create({
        user_id: userId,
        revenue_cat_app_user_id: app_user_id || `rc_user_${userId}`,
        product_id: product_id || 'keyoh_property_boost_monthly',
        package_id: info.type,
        offering_id: 'default',
        entitlement_id: info.entitlement,
        billing_period: info.period,
        status: type === 'CANCELLATION' || type === 'EXPIRATION' ? 'expired' : 'active',
        start_date: new Date(),
        expire_date: info.period === 'monthly'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : info.period === 'annual'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : null,
        will_renew: type !== 'CANCELLATION' && info.period !== 'one_time',
        store: store === 'PLAY_STORE' ? 'play_store' : 'app_store',
      });
    }

    return res.status(200).json({ success: true, message: 'RevenueCat webhook processed' });
  } catch (error) {
    console.error('[billing:revenuecat:error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Stripe Identity Webhook Listener
router.post('/stripe', async (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.type) {
      return res.status(400).json({ success: false, message: 'Invalid Stripe webhook payload' });
    }

    if (event.type === 'identity.verification_session.verified') {
      const session = event.data?.object;
      const userId = session?.client_reference_id || session?.metadata?.user_id || 2;

      const user = await Users.findByPk(userId);
      if (user) {
        user.stripe_identity_status = 'pass';
        user.stripe_identity_date = new Date();
        if (user.email_verified && user.phone_verified) {
          user.is_verified_buyer = true;
        }
        await user.save();
      }
    }

    return res.status(200).json({ success: true, message: 'Stripe Identity webhook processed' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
