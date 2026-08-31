const express = require('express');
const router = express.Router();
const Users = require('../models/users');
const { ChatAuthMiddleware, PropertyOwnerMiddleware } = require('../middleware');
const { lookupPostcode } = require('../services/addressService');
const { sendPushToUser } = require('../services/pushNotificationService');

// Initialize Stripe SDK conditionally if STRIPE_SECRET_KEY is configured
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const Stripe = require('stripe');
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    console.log('[VerificationController] ✓ Official Stripe SDK initialized');
  } catch (err) {
    console.warn('[VerificationController] Stripe initialization warning:', err.message);
  }
}

// GET /verification/postcode-lookup — Royal Mail PAF & Ordnance Survey UK Address Verification
router.get('/postcode-lookup', async (req, res) => {
  try {
    const postcode = req.query.postcode || req.query.q;
    if (!postcode) {
      return res.status(400).json({
        success: false,
        message: 'postcode query parameter is required (e.g. /verification/postcode-lookup?postcode=SW1A1AA)',
      });
    }

    const result = await lookupPostcode(postcode);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[VerificationController] Postcode lookup error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Postcode address lookup failed.',
    });
  }
});

// Helper to check if buyer meets all 3 criteria for Verified Buyer Badge
const calculateVerifiedStatus = (user) => {
  return Boolean(
    user.email_verified &&
    user.phone_verified &&
    user.stripe_identity_status === 'pass'
  );
};

// GET /verification/buyer/status
router.get('/buyer/status', ChatAuthMiddleware, async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id, {
      attributes: [
        'id',
        'email',
        'phone',
        'email_verified',
        'phone_verified',
        'stripe_identity_status',
        'stripe_identity_date',
        'buyer_position',
        'is_verified_buyer',
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    // If Stripe Identity check is pending, actively poll Stripe session status
    if (stripe && user.stripe_identity_status === 'pending' && user.stripe_identity_session_id) {
      try {
        const session = await stripe.identity.verificationSessions.retrieve(user.stripe_identity_session_id);
        if (session.status === 'verified') {
          user.stripe_identity_status = 'pass';
          user.stripe_identity_date = new Date();
          user.email_verified = true;
          user.phone_verified = true;
          user.is_verified_buyer = true;
          await user.save();
          console.log(`[StripeIdentity] ✓ Auto-polled: User #${user.id} Stripe Identity verified!`);
        } else if (session.status === 'requires_input') {
          user.stripe_identity_status = 'fail';
          await user.save();
        }
      } catch (pollErr) {
        console.warn('[StripeIdentity] Status poll error:', pollErr.message);
      }
    }

    const isVerified = calculateVerifiedStatus(user);

    // Auto-sync is_verified_buyer if criteria met
    if (user.is_verified_buyer !== isVerified) {
      user.is_verified_buyer = isVerified;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        email_verified: Boolean(user.email_verified),
        phone_verified: Boolean(user.phone_verified),
        stripe_identity_status: user.stripe_identity_status,
        stripe_identity_date: user.stripe_identity_date,
        buyer_position: user.buyer_position,
        is_verified_buyer: isVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /verification/buyer/position
router.post('/buyer/position', ChatAuthMiddleware, async (req, res) => {
  try {
    const { position } = req.body;
    const validPositions = ['cash_buyer', 'mortgage_in_principle', 'mortgage_not_arranged'];

    if (!validPositions.includes(position)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid buyer position statement. Must be cash_buyer, mortgage_in_principle, or mortgage_not_arranged.',
      });
    }

    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    user.buyer_position = position;
    const isVerified = calculateVerifiedStatus(user);
    user.is_verified_buyer = isVerified;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Buyer position updated successfully',
      data: {
        buyer_position: user.buyer_position,
        is_verified_buyer: isVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /verification/stripe-identity/session
router.post('/stripe-identity/session', ChatAuthMiddleware, async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    let sessionId = `vs_keyoh_${Date.now()}_${user.id}`;
    let clientSecret = `${sessionId}_secret_mock`;
    let verifyUrl = `https://verify.stripe.com/start/${sessionId}`;

    // If Stripe SDK is configured with secret key, create real Stripe Verification Session
    if (stripe) {
      try {
        const session = await stripe.identity.verificationSessions.create({
          type: 'document',
          metadata: {
            user_id: String(user.id),
            user_email: user.email,
          },
          options: {
            document: {
              require_matching_selfie: true,
            },
          },
        });
        sessionId = session.id;
        clientSecret = session.client_secret;
        verifyUrl = session.url || `https://verify.stripe.com/start/${session.id}`;
        console.log(`[StripeIdentity] ✓ Created Stripe Verification Session ${sessionId} for User #${user.id}`);
      } catch (stripeErr) {
        console.error('[StripeIdentity] Stripe API Session Creation error:', stripeErr.message);
      }
    }

    user.stripe_identity_session_id = sessionId;
    user.stripe_identity_status = 'pending';
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        session_id: sessionId,
        client_secret: clientSecret,
        url: verifyUrl,
        status: user.stripe_identity_status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /verification/stripe-identity/webhook — Webhook for Stripe Identity verification events
router.post('/stripe-identity/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log(`[StripeWebhook] Received event: ${event?.type}`);

    if (event?.type === 'identity.verification_session.verified') {
      const session = event.data?.object;
      const userId = session?.metadata?.user_id;

      if (userId) {
        const user = await Users.findByPk(userId);
        if (user) {
          user.stripe_identity_status = 'pass';
          user.stripe_identity_date = new Date();
          user.email_verified = true;
          user.phone_verified = true;
          user.is_verified_buyer = true;
          await user.save();
          console.log(`[StripeWebhook] 🎉 User #${userId} (${user.email}) Stripe Identity status set to PASS`);

          // Dispatch push notification to user
          sendPushToUser(user.id, {
            title: 'KEYOH | Identity Verified ✓',
            body: 'Congratulations! Your Stripe Identity check passed. Your Verified Buyer status is active.',
            data: { type: 'verification_passed', screen: 'VerifiedBuyer' },
          });
        }
      }
    } else if (event?.type === 'identity.verification_session.requires_input') {
      const session = event.data?.object;
      const userId = session?.metadata?.user_id;
      if (userId) {
        const user = await Users.findByPk(userId);
        if (user) {
          user.stripe_identity_status = 'fail';
          await user.save();

          // Dispatch push notification to user
          sendPushToUser(user.id, {
            title: 'KEYOH | Verification Action Needed ⚠️',
            body: 'Your identity check requires input. Please re-upload a clear photo of your ID document.',
            data: { type: 'verification_failed', screen: 'VerifiedBuyer' },
          });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[StripeWebhook] Error processing webhook:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
});

// POST /verification/stripe-identity/simulate-result (For testing & webhook pass/fail)
router.post('/stripe-identity/simulate-result', ChatAuthMiddleware, async (req, res) => {
  try {
    const { result } = req.body; // 'pass' | 'fail'
    if (!['pass', 'fail'].includes(result)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid result type. Must be pass or fail.',
      });
    }

    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    user.stripe_identity_status = result;
    user.stripe_identity_date = new Date();
    // Default email and phone verification to true when ID passes for test verification pipeline
    if (result === 'pass') {
      user.email_verified = true;
      user.phone_verified = true;
    }

    const isVerified = calculateVerifiedStatus(user);
    user.is_verified_buyer = isVerified;
    await user.save();

    // Dispatch push notification
    sendPushToUser(user.id, {
      title: result === 'pass' ? 'KEYOH | Identity Verified ✓' : 'KEYOH | Verification Action Needed ⚠️',
      body: result === 'pass'
        ? 'Congratulations! Your Stripe Identity check passed. Your Verified Buyer status is active.'
        : 'Your identity check requires input. Please re-upload a clear photo of your ID document.',
      data: { type: result === 'pass' ? 'verification_passed' : 'verification_failed', screen: 'VerifiedBuyer' },
    });

    return res.status(200).json({
      success: true,
      message: `Stripe Identity check recorded as ${result}`,
      data: {
        stripe_identity_status: user.stripe_identity_status,
        stripe_identity_date: user.stripe_identity_date,
        is_verified_buyer: isVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /verification/seller/ownership-declaration
router.post('/seller/ownership-declaration', PropertyOwnerMiddleware, async (req, res) => {
  try {
    const { declaration_confirmed } = req.body;

    if (declaration_confirmed !== true) {
      return res.status(400).json({
        success: false,
        message: 'You must tick and confirm that you own the property or have legal authority to sell it.',
      });
    }

    const seller = await Users.findByPk(req.user.id);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller account not found',
      });
    }

    seller.seller_ownership_declaration = true;
    seller.seller_ownership_declaration_date = new Date();
    await seller.save();

    return res.status(200).json({
      success: true,
      message: 'Seller property ownership declaration recorded successfully',
      data: {
        seller_ownership_declaration: seller.seller_ownership_declaration,
        seller_ownership_declaration_date: seller.seller_ownership_declaration_date,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
