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
    const preferredLocation = (user.location || '').trim().toLowerCase();
    const maxPrice = parseFloat(user.max_price) || 0;

    // 36-hour server-side rotation epoch key
    const ROTATION_PERIOD_MS = 36 * 60 * 60 * 1000;
    const currentEpoch = Math.floor(Date.now() / ROTATION_PERIOD_MS);

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

    // Fetch active available properties from database
    const activeProperties = await Properties.findAll({
      where: whereCondition,
      include: [
        { model: PropertyType, as: 'propertyType' },
        { model: TenureType, as: 'tenureType' },
        { model: Users, as: 'agentProperties', attributes: ['id', 'name', 'email', 'phone', 'agency_name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const strictMatches = [];
    const nearestMatches = [];

    for (const prop of activeProperties) {
      const propBeds = parseInt(prop.beds || '0', 10);
      const propPrice = parseFloat(prop.price) || 0;
      const propAddress = (prop.address || '').toLowerCase();
      const propPostcode = (prop.post_code || '').toLowerCase();

      // STRICT LIMIT 1: Never fewer bedrooms than the buyer requested
      if (propBeds < preferredBeds) {
        continue;
      }

      const isLocMatch = !preferredLocation || propAddress.includes(preferredLocation) || propPostcode.includes(preferredLocation);
      const isPriceMatch = maxPrice <= 0 || propPrice <= maxPrice;
      const isPriceNearMatch = maxPrice <= 0 || propPrice <= maxPrice * 1.10; // Up to 10% above budget

      const rawProp = prop.toJSON();
      const metrics = calculateMatchMetrics(prop, user);

      const formattedItem = {
        ...rawProp,
        id: String(rawProp.id),
        formattedPrice: `£${propPrice.toLocaleString()}`,
        compatibility: metrics.compatibility,
        signals: metrics.signals,
        monthlyPayment: metrics.monthlyPayment,
        sellerName: rawProp.agentProperties?.name || 'Seller',
        verified: true,
      };

      if (isLocMatch && isPriceMatch) {
        // Strict Match
        strictMatches.push({
          ...formattedItem,
          isNearestMatch: false,
        });
      } else if (isPriceNearMatch) {
        // Nearest Match (Location widened first, price widened up to +10% max)
        nearestMatches.push({
          ...formattedItem,
          isNearestMatch: true,
          signals: [
            ...metrics.signals.filter(s => !s.toLowerCase().includes('budget')),
            propPrice > maxPrice && maxPrice > 0 ? 'Nearest match (within 10% of budget)' : 'Nearest match in extended area',
          ],
        });
      }
    }

    // Sort both groups by compatibility score descending
    strictMatches.sort((a, b) => b.compatibility - a.compatibility);
    nearestMatches.sort((a, b) => b.compatibility - a.compatibility);

    // Combine strict matches with nearest matches up to exactly 3 homes
    const selectedHomes = [...strictMatches];
    if (selectedHomes.length < 3) {
      const needed = 3 - selectedHomes.length;
      selectedHomes.push(...nearestMatches.slice(0, needed));
    }

    // Strictly enforce maximum 3 homes
    const finalDeck = selectedHomes.slice(0, 3);

    const nextRefreshAt = new Date((currentEpoch + 1) * ROTATION_PERIOD_MS).toISOString();

    return res.status(200).json({
      success: true,
      data: {
        matches: finalDeck,
        count: finalDeck.length,
        isShortDeck: finalDeck.length < 3,
        userPreferences: {
          location: user.location || 'All areas',
          preferred_beds: user.preferred_beds || 2,
          buyer_type: user.buyer_type || 'Homebuyer',
          timeline: user.timeline || 'Flexible',
          max_price: user.max_price,
        },
        nextRefreshAt,
        rotationPeriodHours: 36,
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
