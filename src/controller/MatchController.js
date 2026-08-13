const express = require('express');
const router = express.Router();
const { ChatAuthMiddleware } = require('../middleware');
const { Properties, PropertyType, TenureType, Users } = require('../models');
const { Op } = require('sequelize');

/**
 * Helper to calculate dynamic match score & signals based on buyer preferences
 */
function calculateMatchMetrics(property, user) {
  let score = 70; // baseline score
  const signals = [];

  const prefBeds = user.preferred_beds || 2;
  const prefLoc = (user.location || '').toLowerCase();
  const maxPrice = parseFloat(user.max_price) || 0;
  const propPrice = parseFloat(property.price) || 0;

  // 1. Location match
  if (prefLoc && (
    (property.address || '').toLowerCase().includes(prefLoc) ||
    (property.post_code || '').toLowerCase().includes(prefLoc)
  )) {
    score += 20;
    signals.push(`Matches location "${user.location}"`);
  } else if (property.address) {
    const city = property.address.split(',').pop()?.trim() || property.address;
    signals.push(`Located in ${city}`);
  }

  // 2. Bedrooms match
  if (property.beds === prefBeds) {
    score += 10;
    signals.push(`Exact match: ${property.beds} Bedrooms`);
  } else if (Math.abs(property.beds - prefBeds) <= 1) {
    score += 5;
    signals.push(`${property.beds} Bedrooms (${user.buyer_type || 'Comfortable layout'})`);
  } else {
    signals.push(`${property.beds} Bedrooms, ${property.baths} Bathrooms`);
  }

  // 3. Price / Budget match
  if (maxPrice > 0 && propPrice <= maxPrice) {
    score += 10;
    signals.push(`Within your max budget (£${maxPrice.toLocaleString()})`);
  } else if (maxPrice > 0 && propPrice <= maxPrice * 1.1) {
    score += 5;
    signals.push(`Slightly above target budget`);
  } else {
    signals.push(`Offers accepted / Cash buyers welcome`);
  }

  // 4. Tenure & Type signal
  if (property.tenureType?.name) {
    signals.push(`${property.tenureType.name} tenure`);
  } else {
    signals.push(`Verified keyoh listing`);
  }

  // Cap score between 75 and 98
  const finalScore = Math.min(98, Math.max(75, score));

  // Compute estimated monthly mortgage (standard 30yr @ 4.5% interest)
  const monthlyEst = propPrice > 0 ? Math.round((propPrice * 0.005)) : 0;
  const monthlyPayment = monthlyEst > 0 ? `£${monthlyEst.toLocaleString()}` : null;

  return {
    compatibility: finalScore,
    signals,
    monthlyPayment,
  };
}

/**
 * GET /match/top3
 * Returns active properties matching buyer preferences.
 */
router.get('/top3', ChatAuthMiddleware, async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const preferredBeds = parseInt(user.preferred_beds || '2', 10) || 2;
    const preferredLocation = (user.location || '').trim();

    // 48-hour rotation epoch key
    const ROTATION_PERIOD_MS = 48 * 60 * 60 * 1000;
    const currentEpoch = Math.floor(Date.now() / ROTATION_PERIOD_MS);
    const rotationSeed = (req.user.id + currentEpoch) % 100;

    // Fetch property IDs user has already swiped on
    const { UserSwipes } = require('../models');
    let swipedPropertyIds = [];
    try {
      const swipes = await UserSwipes.findAll({
        where: { user_id: req.user.id },
        attributes: ['property_id'],
      });
      swipedPropertyIds = swipes.map(s => s.property_id);
    } catch (e) {
      console.error('[match] UserSwipes query warning:', e.message);
    }

    const whereCondition = {
      status: 'available',
      hidden_at: null,
      deleted_at: null,
    };
    if (swipedPropertyIds.length > 0) {
      whereCondition.id = { [Op.notIn]: swipedPropertyIds };
    }

    // Fetch active available properties
    const activeProperties = await Properties.findAll({
      where: whereCondition,
      include: [
        { model: PropertyType, as: 'propertyType' },
        { model: TenureType, as: 'tenureType' },
        { model: Users, as: 'agentProperties', attributes: ['id', 'name', 'email', 'phone', 'agency_name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 20,
    });

    // Score properties
    const scoredProperties = activeProperties.map((prop) => {
      const metrics = calculateMatchMetrics(prop, user);
      const rawProp = prop.toJSON();
      const numPrice = parseFloat(rawProp.price) || 0;
      
      return {
        ...rawProp,
        id: String(rawProp.id),
        formattedPrice: `£${numPrice.toLocaleString()}`,
        compatibility: metrics.compatibility,
        signals: metrics.signals,
        monthlyPayment: metrics.monthlyPayment,
        sellerName: rawProp.agentProperties?.name || 'Seller',
        verified: true,
      };
    });

    // Sort by compatibility score
    scoredProperties.sort((a, b) => b.compatibility - a.compatibility);

    // Pick top matches
    const selectedHomes = scoredProperties.slice(0, 5);

    const nextRefreshAt = new Date((currentEpoch + 1) * ROTATION_PERIOD_MS).toISOString();

    return res.status(200).json({
      success: true,
      data: {
        matches: selectedHomes,
        count: selectedHomes.length,
        userPreferences: {
          location: user.location || 'All areas',
          preferred_beds: user.preferred_beds || 2,
          buyer_type: user.buyer_type || 'Homebuyer',
          timeline: user.timeline || 'Flexible',
          max_price: user.max_price,
        },
        nextRefreshAt,
        rotationPeriodHours: 48,
      },
    });
  } catch (error) {
    console.error('[match] top3 error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /match/swipe
 * Persists user choice ('like' or 'pass') for a matched property.
 */
router.post('/swipe', ChatAuthMiddleware, async (req, res) => {
  try {
    const { property_id, action } = req.body;
    if (!property_id || !['like', 'pass'].includes(action)) {
      return res.status(400).json({ success: false, message: 'property_id and valid action ("like" or "pass") are required.' });
    }

    const { UserSwipes } = require('../models');
    const [swipe, created] = await UserSwipes.findOrCreate({
      where: {
        user_id: req.user.id,
        property_id: parseInt(property_id, 10),
      },
      defaults: {
        action,
      },
    });

    if (!created) {
      swipe.action = action;
      await swipe.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        property_id,
        action,
        saved: true,
      },
    });
  } catch (error) {
    console.error('[match] swipe error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
