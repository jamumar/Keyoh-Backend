const express = require('express');
const router = express.Router();
const PartnerClickLogs = require('../models/partner-click-logs');
const PartnerReferralLeads = require('../models/partner-referral-leads');
const Users = require('../models/users');
const { ChatAuthMiddleware } = require('../middleware');
const crypto = require('crypto');

// Generate unique KEYOH partner referral code
const generateReferralCode = (partnerType) => {
  const prefix = partnerType === 'mortgage' ? 'KYH-MORT' : 'KYH-SOL';
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${randomHex}`;
};

// POST /referral/click — Log tap-through to mortgage/conveyancing partner
router.post('/click', async (req, res) => {
  try {
    const { partner_type, property_id } = req.body;
    if (!['mortgage', 'conveyancing'].includes(partner_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid partner type. Must be mortgage or conveyancing.',
      });
    }

    // Try extract user_id if token provided (optional)
    let userId = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const user = jwt.decode(token);
        userId = user?.id || user?.userId || null;
      } catch (e) {
        // Optional token parsing
      }
    }

    const clickLog = await PartnerClickLogs.create({
      user_id: userId,
      partner_type,
      property_id: property_id || null,
      ip_address: req.ip || req.headers['x-forwarded-for'] || '',
      user_agent: req.headers['user-agent'] || '',
      clicked_at: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: 'Partner tap-through logged successfully',
      data: {
        id: clickLog.id,
        partner_type: clickLog.partner_type,
        clicked_at: clickLog.clicked_at,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /referral/lead — Submit referral lead with unique KEYOH reference code
router.post('/lead', ChatAuthMiddleware, async (req, res) => {
  try {
    const { partner_type, name, email, phone, notes, property_id } = req.body;

    if (!['mortgage', 'conveyancing'].includes(partner_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid partner type. Must be mortgage or conveyancing.',
      });
    }

    const user = await Users.findByPk(req.user.id);
    const leadName = name || user?.name || 'KEYOH User';
    const leadEmail = email || user?.email;
    const leadPhone = phone || user?.phone || '';

    if (!leadEmail || !leadEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Valid contact email is required for referral lead.',
      });
    }

    const referenceCode = generateReferralCode(partner_type);

    const lead = await PartnerReferralLeads.create({
      reference_code: referenceCode,
      user_id: req.user.id,
      partner_type,
      property_id: property_id || null,
      name: leadName,
      email: leadEmail.trim().toLowerCase(),
      phone: leadPhone,
      notes: notes || '',
      status: 'submitted',
    });

    return res.status(201).json({
      success: true,
      message: 'Referral lead submitted successfully with KEYOH tracking reference',
      data: {
        id: lead.id,
        reference_code: lead.reference_code,
        partner_type: lead.partner_type,
        status: lead.status,
        created_at: lead.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /referral/leads — List user's submitted referral leads
router.get('/leads', ChatAuthMiddleware, async (req, res) => {
  try {
    const leads = await PartnerReferralLeads.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      data: leads,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
