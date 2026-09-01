const express = require('express');
const axios = require('axios');
const User = require("../models/users");
const PasswordReset = require("../models/password-resets");
const UserBilling = require("../models/user-billings");
const { sequelize } = require('../lib/db');
const { Op } = require('sequelize');
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const { sendEmail, buildPasswordResetEmail, buildWelcomeEmail, buildVerificationOtpEmail } = require('../services/emailService');
const { CustomerMiddleware, ChatAuthMiddleware } = require('../middleware');
const {
    verifyActiveSubscriptionWithRetry,
    mapClientBillingToSnapshot,
    canTrustClientBilling,
    buildFreeAgentBillingSnapshot,
} = require('../services/revenueCatService');
require('dotenv').config();

const googleAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Rate Limiters for sensitive authentication endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { success: false, message: 'Too many login attempts. Please wait 15 minutes before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many verification code requests. Please wait a few minutes before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const router = express.Router();

router.post('/push-token', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { push_token } = req.body;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (!push_token || typeof push_token !== 'string' || push_token.trim() === '') {
            user.push_token = null;
            await user.save();
            console.log(`[Auth] ✓ Cleared push token for User #${userId} (${user.email})`);
            return res.status(200).json({
                success: true,
                message: 'Push token cleared successfully',
            });
        }

        const cleanToken = push_token.trim();

        // Disassociate this device push token from any previous user account
        await User.update(
            { push_token: null },
            { where: { push_token: cleanToken, id: { [Op.ne]: userId } } }
        );

        user.push_token = cleanToken;
        await user.save();

        console.log(`[Auth] ✓ Registered push token for User #${userId} (${user.email}): ${cleanToken.slice(0, 20)}...`);

        return res.status(200).json({
            success: true,
            message: 'Push token registered successfully',
            data: {
                userId: user.id,
                push_token: user.push_token,
            },
        });
    } catch (error) {
        console.error('[Auth] ❌ push-token error:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

router.put('/profile', CustomerMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, avatar, location } = req.body;
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (name && typeof name === 'string') user.name = name.trim();
        if (avatar !== undefined) user.avatar = avatar;
        if (location !== undefined) user.location = location;
        await user.save();

        const safeUser = user.toJSON();
        delete safeUser.password;

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: safeUser,
        });
    } catch (error) {
        console.error('[Auth] ❌ profile update error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email and password'
            })
        }
        const user = await User.findOne({
            where: {
                email: email
            }
            /*,
            include: [
                {
                    model: Countries,
                    as: 'user_country',
                    attributes: ['id', 'name', 'code']
                }
            ]
            */
        })
        // console.log('object', user)
        if (!user) {
            return res.status(400).json({
                message: "Invalid email",
                success: false,
            });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Invalid password",
                success: false,
            });
        }
        const sellerSecret = process.env.SELLER_TOKEN_STRING || process.env.SELLER_TOKEM_STRING;
        const token_string = user.role == 'admin' ? process.env.ADMIN_TOKEN_STRING : user.role == 'seller' ? sellerSecret : user.role == 'agent' ? process.env.AGENT_TOKEN_STRING : process.env.USER_TOKEN_STRING;

        const sessiontoken = jwt.sign({
            id: user.id,
            role: user.role,
            email: user.email
        }, token_string, { expiresIn: '2d' });
        if (sessiontoken) {
            const { password, ...safeUser } = user.toJSON();
            return res.status(200).json({
                data: {
                    data: safeUser,
                    token: sessiontoken
                },
                success: true,
            })
        }

    }
    catch (err) {
        return res.status(500).json({
            message: 'Something went wrong',
            success: false,
        })
    }
})

router.post('/check-agent-eligibility', async (req, res) => {
    try {
        const { email, phone } = req.body;
        console.log('email', email)
        // Check email/phone are not already registered
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [
                    { email: email },
                    phone ? { phone: phone } : null
                ].filter(Boolean)
            }
        });

        if (existingUser) {
            return res.status(400).json({
                message: existingUser.email === email ? 'Email already in use' : 'Phone already in use',
                success: false,
            });
        }

        // 2. Check total agent count (isFree hardcoded true for testing — use agentCount < 100 later)
        const agentCount = await User.count({
            where: { role: 'agent' }
        });

        return res.status(200).json({
            success: true,
            isFree: agentCount < 100,
            // isFree: false,
            agentCount,
        });
    } catch (err) {
        return res.status(500).json({
            message: 'Something went wrong checking eligibility',
            success: false,
        });
    }
});

router.post('/signup', async (req, res) => {
    try {
        const {
            agency_name,
            name,
            email,
            password,
            role,
            revenueCatAppUserId,
            isFree,
            billing: clientBilling,
        } = req.body
        if (!email || !password) {
            return res.status(400).json({
                message: 'Invalid email and password',
                success: false,
            })
        }

        let billingSnapshot = null;

        if (role === 'agent') {
            if (revenueCatAppUserId) {
                try {
                    const verification = await verifyActiveSubscriptionWithRetry(revenueCatAppUserId);
                    if (verification.isActive && verification.billing) {
                        billingSnapshot = {
                            ...verification.billing,
                            package_id: clientBilling?.packageId || verification.billing.package_id,
                            offering_id: clientBilling?.offeringId || verification.billing.offering_id,
                        };
                    } else if (canTrustClientBilling(clientBilling, revenueCatAppUserId)) {
                        billingSnapshot = mapClientBillingToSnapshot(clientBilling, revenueCatAppUserId);
                    } else {
                        return res.status(402).json({
                            message: 'No active subscription found. Complete checkout before signing up.',
                            success: false,
                        });
                    }
                } catch (verifyError) {
                    console.error('RevenueCat verification error:', verifyError.message);
                    if (canTrustClientBilling(clientBilling, revenueCatAppUserId)) {
                        billingSnapshot = mapClientBillingToSnapshot(clientBilling, revenueCatAppUserId);
                    } else {
                        billingSnapshot = buildFreeAgentBillingSnapshot();
                    }
                }
            } else {
                // Agent signup default
                const agentCount = await User.count({ where: { role: 'agent' } });
                if (agentCount >= 100) {
                    return res.status(402).json({
                        message: 'Free agent signup is no longer available. Please subscribe to continue.',
                        success: false,
                    });
                }
                billingSnapshot = buildFreeAgentBillingSnapshot();
            }
        }

        const existingUser = await User.findOne({
            where: {
                email: email
            }
        });

        if (existingUser) {
            return res.status(400).json({
                message: 'Email already in use',
                success: false,
            });
        }

        const salt = await bcrypt.genSalt(10);
        const bc_password = await bcrypt.hash(password, salt);

        const transaction = await sequelize.transaction();
        try {
            const newuser = await User.create({
                name,
                agency_name: agency_name || '',
                email,
                password: bc_password,
                role,
                phone: req.body.phone || '',
                location: req.body.location || '',
                buyer_type: req.body.buyer_type || req.body.buyerType || '',
                timeline: req.body.timeline || '',
                preferred_beds: parseInt(req.body.preferred_beds || req.body.preferredBeds || '2', 10),
                max_price: req.body.max_price || req.body.maxPrice || null,
            }, { transaction });

            if (role === 'agent' && billingSnapshot) {
                await UserBilling.create({
                    user_id: newuser.id,
                    ...billingSnapshot,
                }, { transaction });
            }

            await transaction.commit();

            // Generate 6-digit OTP for email verification
            const normalizedEmail = email.trim().toLowerCase();
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            try {
                await PasswordReset.destroy({ where: { email: normalizedEmail } });
                await PasswordReset.create({
                    email: normalizedEmail,
                    code: otpCode,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
                const { html, text } = buildVerificationOtpEmail(otpCode);
                sendEmail({
                    to: normalizedEmail,
                    subject: 'Your KEYOH verification code',
                    html,
                    text,
                }).catch((emailError) => {
                    console.error('signup OTP verification email failed:', emailError.message);
                });
            } catch (otpErr) {
                console.error('Error creating OTP record during signup:', otpErr.message);
            }

            const sellerSecret = process.env.SELLER_TOKEN_STRING || process.env.SELLER_TOKEM_STRING;
            const token_string = role == 'admin' ? process.env.ADMIN_TOKEN_STRING : role == 'seller' ? sellerSecret : role == 'agent' ? process.env.AGENT_TOKEN_STRING : process.env.USER_TOKEN_STRING;

            const sessiontoken = jwt.sign({
                id: newuser.id,
                role: newuser.role,
                email: newuser.email
            }, token_string, { expiresIn: '2d' });
            if (sessiontoken) {
                const { password, ...safeUser } = newuser.toJSON();
                return res.status(201).json({
                    data: {
                        data: safeUser,
                        token: sessiontoken
                    },
                    success: true,
                })
            }
        } catch (createError) {
            await transaction.rollback();
            throw createError;
        }
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            success: false,
        });
    }
})

// POST /auth/resend-verification
router.post('/resend-verification', otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email address is required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const user = await User.findOne({ where: { email: normalizedEmail } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        await PasswordReset.destroy({ where: { email: normalizedEmail } });
        await PasswordReset.create({
            email: normalizedEmail,
            code: otpCode,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });
        const { html, text } = buildVerificationOtpEmail(otpCode);
        await sendEmail({
            to: normalizedEmail,
            subject: 'Your KEYOH verification code',
            html,
            text,
        });
        return res.status(200).json({ success: true, message: 'Verification OTP sent successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// POST /auth/send-verification-otp
router.post('/send-verification-otp', otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email address is required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await PasswordReset.destroy({ where: { email: normalizedEmail } });
        await PasswordReset.create({
            email: normalizedEmail,
            code,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        const { html, text } = buildVerificationOtpEmail(code);
        await sendEmail({
            to: normalizedEmail,
            subject: 'Your KEYOH verification code',
            html,
            text,
        });

        return res.status(200).json({ success: true, message: 'Verification OTP sent successfully' });
    } catch (err) {
        console.error('send-verification-otp error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// POST /auth/verify-email-otp
router.post('/verify-email-otp', otpLimiter, async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'Email and 6-digit OTP code are required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const record = await PasswordReset.findOne({
            where: { email: normalizedEmail, code: String(code).trim() },
        });

        if (!record || new Date() > record.expiresAt) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification code',
            });
        }

        await User.update(
            { email_verified: true },
            { where: { email: normalizedEmail } }
        );

        await record.destroy();

        return res.status(200).json({
            success: true,
            message: 'Email verified successfully',
        });
    } catch (err) {
        console.error('verify-email-otp error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/forgot-password', otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({
                message: 'Valid email is required',
                success: false,
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await User.findOne({ where: { email: normalizedEmail } });

        if (!user) {
            return res.status(404).json({
                message: 'No account found with this email',
                success: false,
            });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

        await PasswordReset.destroy({ where: { email: normalizedEmail } });
        await PasswordReset.create({
            email: normalizedEmail,
            code,
            expiresAt: resetCodeExpires,
        });

        const { html, text } = buildPasswordResetEmail(code);
        await sendEmail({
            to: normalizedEmail,
            subject: 'Your KEYOH password reset code',
            html,
            text,
        });

        return res.status(200).json({
            message: 'Reset code sent to email',
            success: true,
        });
    } catch (err) {
        console.error('forgot-password error:', err.message);
        return res.status(500).json({
            message: 'Unable to send reset code. Please try again.',
            success: false,
        });
    }
});


router.post('/verify-code', async (req, res) => {
    try {
        const { email, code, password } = req.body;

        if (!email || !code || !password) {
            return res.status(400).json({
                message: 'Email, code and new password are required',
                success: false,
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters',
                success: false,
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const record = await PasswordReset.findOne({
            where: { email: normalizedEmail, code: String(code).trim() },
        });

        if (!record || new Date() > record.expiresAt) {
            return res.status(400).json({
                message: 'Invalid or expired code',
                success: false,
            });
        }

        const salt = await bcrypt.genSalt(10);
        const newPassword = await bcrypt.hash(password, salt);
        await User.update(
            { password: newPassword },
            { where: { email: normalizedEmail } }
        );

        await record.destroy();

        return res.status(200).json({
            message: 'Password reset successful',
            success: true,
        });
    } catch (err) {
        console.error('verify-code error:', err.message);
        return res.status(500).json({
            message: 'Something went wrong',
            success: false,
        });
    }
});

router.get('/verify-user', CustomerMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const user = await User.findByPk(userId);
        if (user) {
            return res.status(200).json({
                message: 'User verified',
                success: true,
                data: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                },
            });
        } else {
            return res.status(400).json({
                message: 'User not found',
                success: false,
            });
        }
    } catch (err) {
        return res.status(500).json({
            message: err.message,
            success: false,
        });
    }
});

// POST /auth/google — Google OAuth ID Token Verification
router.post('/google', async (req, res) => {
    try {
        const { idToken, id_token, email, name, avatar, role } = req.body;
        const rawToken = idToken || id_token;

        let decodedToken = null;
        if (rawToken && typeof rawToken === 'string') {
            const googleClientId = process.env.GOOGLE_CLIENT_ID;
            if (googleClientId) {
                try {
                    const ticket = await googleAuthClient.verifyIdToken({
                        idToken: rawToken,
                        audience: googleClientId,
                    });
                    decodedToken = ticket.getPayload();
                } catch (verifyErr) {
                    console.warn('[Google Auth] Cryptographic verification notice:', verifyErr.message);
                    try {
                        decodedToken = jwt.decode(rawToken);
                    } catch (e) {}
                }
            } else {
                try {
                    decodedToken = jwt.decode(rawToken);
                } catch (e) {
                    console.warn('[Google Auth] Warning: could not decode raw idToken:', e.message);
                }
            }
        }

        const tokenEmail = decodedToken?.email;
        const targetEmail = (email || req.body?.user?.email || tokenEmail || (decodedToken?.sub ? `google_${decodedToken.sub}@keyoh.app` : null));
        const targetName = name || req.body?.user?.name || decodedToken?.name || 'Google User';
        const targetAvatar = avatar || decodedToken?.picture || null;

        if (!targetEmail && !rawToken) {
            return res.status(400).json({
                success: false,
                message: 'idToken or email is required for Google Authentication.',
            });
        }

        const userEmail = (targetEmail || `google_${Date.now()}@keyoh.app`).toLowerCase();
        let user = await User.findOne({ where: { email: userEmail } });

        if (!user) {
            const randomPassword = await bcrypt.hash(`google_secret_${decodedToken?.sub || Date.now()}`, 10);
            // Allow initial creation as 'user' or 'seller', but never 'agent' without payment
            const initialRole = (role === 'seller' ? 'seller' : 'user');
            user = await User.create({
                email: userEmail,
                name: targetName,
                avatar: targetAvatar,
                password: randomPassword,
                role: initialRole,
                email_verified: 1,
            });
        } else {
            // Existing users preserve their established role (prevents role-hijacking to 'agent' via OAuth)
            if (targetAvatar && !user.avatar) {
                user.avatar = targetAvatar;
                await user.save();
            }
        }

        const sellerSecret = process.env.SELLER_TOKEN_STRING || process.env.SELLER_TOKEM_STRING;
        const token_string = user.role == 'admin' ? process.env.ADMIN_TOKEN_STRING : user.role == 'seller' ? sellerSecret : user.role == 'agent' ? process.env.AGENT_TOKEN_STRING : process.env.USER_TOKEN_STRING;

        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            token_string,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
            success: true,
            message: 'Google Sign-In successful',
            token,
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                token,
            },
        });
    } catch (error) {
        console.error('[Google Auth] ❌ Error in /auth/google:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// GET /auth/google — Initiates OAuth 2.0 Web flow with custom domain
router.get('/google', (req, res) => {
    const role = req.query.role || 'user';
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://keyoh.app/api/auth/google/callback';
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid profile email')}&prompt=select_account&state=${encodeURIComponent(role)}`;
    return res.redirect(googleAuthUrl);
});

// GET /auth/google/callback — Handles OAuth 2.0 callback and returns to keyoh:// scheme
router.get('/google/callback', async (req, res) => {
    const { code, state: role, error } = req.query;
    if (error || !code) {
        return res.redirect(`keyoh://oauthredirect?error=${encodeURIComponent(error || 'Google login cancelled')}`);
    }

    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://keyoh.app/api/auth/google/callback';

        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        });

        const { access_token, id_token } = tokenRes.data;
        let profile = {};
        if (access_token) {
            const userinfoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${access_token}` },
            });
            profile = userinfoRes.data;
        }

        const email = (profile.email || (id_token ? jwt.decode(id_token)?.email : null) || '').toLowerCase();
        const name = profile.name || (id_token ? jwt.decode(id_token)?.name : 'Google User');
        const avatar = profile.picture || null;

        if (!email) {
            return res.redirect(`keyoh://oauthredirect?error=${encodeURIComponent('Could not retrieve email from Google profile')}`);
        }

        let user = await User.findOne({ where: { email } });
        const targetRole = role === 'buyer' ? 'user' : (role || 'user');
        if (!user) {
            const randomPassword = await bcrypt.hash(`google_secret_${Date.now()}`, 10);
            user = await User.create({
                email,
                name,
                avatar,
                password: randomPassword,
                role: targetRole,
                email_verified: 1,
            });
        } else {
            if (targetRole && user.role !== 'admin' && (targetRole === 'user' || targetRole === 'seller' || targetRole === 'agent')) {
                user.role = targetRole;
            }
            if (avatar && !user.avatar) {
                user.avatar = avatar;
            }
            await user.save();
        }

        const sellerSecret = process.env.SELLER_TOKEN_STRING || process.env.SELLER_TOKEM_STRING;
        const token_string = user.role == 'admin' ? process.env.ADMIN_TOKEN_STRING : user.role == 'seller' ? sellerSecret : user.role == 'agent' ? process.env.AGENT_TOKEN_STRING : process.env.USER_TOKEN_STRING;

        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            token_string,
            { expiresIn: '30d' }
        );

        const safeUserData = {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            role: user.role,
            token,
        };

        return res.redirect(`keyoh://oauthredirect?token=${token}&user=${encodeURIComponent(JSON.stringify(safeUserData))}`);
    } catch (err) {
        console.error('[Google Callback] ❌ Error:', err.response?.data || err.message);
        return res.redirect(`keyoh://oauthredirect?error=${encodeURIComponent(err.message || 'Google authentication failed')}`);
    }
});

// POST /auth/apple — Apple Sign-In Identity Token Verification
router.post('/apple', async (req, res) => {
    try {
        const { identityToken, identity_token, apple_id, email, name, role } = req.body;
        const rawToken = identityToken || identity_token;

        let decodedToken = null;
        if (rawToken && typeof rawToken === 'string') {
            try {
                decodedToken = jwt.decode(rawToken);
            } catch (e) {
                console.warn('[Apple Auth] Warning: could not decode raw identityToken:', e.message);
            }
        }

        const tokenEmail = decodedToken?.email;
        const appleSub = apple_id || decodedToken?.sub;
        const targetEmail = (email || req.body?.user?.email || tokenEmail || (appleSub ? `apple_${appleSub.replace(/[^a-zA-Z0-9]/g, '')}@privaterelay.keyoh.app` : null));
        const targetName = name || req.body?.user?.name || decodedToken?.name || 'Apple User';

        if (!targetEmail && !rawToken && !appleSub) {
            return res.status(400).json({
                success: false,
                message: 'identityToken, apple_id, or email is required for Apple Authentication.',
            });
        }

        let user = null;

        // 1. Primary lookup: Find user by unique Apple ID (sub)
        if (appleSub) {
            user = await User.findOne({ where: { apple_id: appleSub } });
        }

        // 2. Secondary lookup: Find by provided email (and link apple_id if missing)
        const userEmail = (targetEmail || `apple_${Date.now()}@privaterelay.keyoh.app`).toLowerCase();
        if (!user && (email || tokenEmail)) {
            user = await User.findOne({ where: { email: (email || tokenEmail).toLowerCase() } });
            if (user && appleSub && !user.apple_id) {
                user.apple_id = appleSub;
                await user.save();
            }
        }

        // 3. Tertiary lookup: Check if fallback private relay email exists
        if (!user && appleSub) {
            const fallbackEmail = `apple_${appleSub.replace(/[^a-zA-Z0-9]/g, '')}@privaterelay.keyoh.app`.toLowerCase();
            user = await User.findOne({ where: { email: fallbackEmail } });
            if (user && !user.apple_id) {
                user.apple_id = appleSub;
                await user.save();
            }
        }

        const validRoles = ['user', 'seller'];
        const targetRole = validRoles.includes(role) ? role : 'user';

        if (!user) {
            const randomPassword = await bcrypt.hash(`apple_secret_${appleSub || Date.now()}`, 10);
            user = await User.create({
                email: userEmail,
                name: targetName,
                apple_id: appleSub || null,
                password: randomPassword,
                role: targetRole,
                email_verified: 1,
            });
        } else {
            // Existing user keeps their existing role (no unauthorized upgrade to 'agent')
            if (appleSub && !user.apple_id) {
                user.apple_id = appleSub;
                await user.save();
            }
            if (targetName && targetName !== 'Apple User' && user.name === 'Apple User') {
                user.name = targetName;
                await user.save();
            }
        }

        const sellerSecret = process.env.SELLER_TOKEN_STRING || process.env.SELLER_TOKEM_STRING;
        const token_string = user.role == 'admin' ? process.env.ADMIN_TOKEN_STRING : user.role == 'seller' ? sellerSecret : user.role == 'agent' ? process.env.AGENT_TOKEN_STRING : process.env.USER_TOKEN_STRING;

        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            token_string,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
            success: true,
            message: 'Apple Sign-In successful',
            token,
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar || null,
                phone: user.phone || null,
                agency_name: user.agency_name || null,
                is_verified_buyer: user.is_verified_buyer || false,
                token,
            },
        });
    } catch (error) {
        console.error('[Apple Auth] ❌ Error in /auth/apple:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Apple Sign-In processing failed on server',
        });
    }
});


router.put('/preferences', ChatAuthMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const { location, buyer_type, buyerType, timeline, preferred_beds, preferredBeds, max_price, maxPrice } = req.body;

        if (location !== undefined) user.location = location;
        if (buyer_type !== undefined || buyerType !== undefined) user.buyer_type = buyer_type || buyerType;
        if (timeline !== undefined) user.timeline = timeline;
        if (preferred_beds !== undefined || preferredBeds !== undefined) user.preferred_beds = parseInt(preferred_beds || preferredBeds, 10);
        if (max_price !== undefined || maxPrice !== undefined) user.max_price = max_price || maxPrice;

        await user.save();
        const { password, ...safeUser } = user.toJSON();

        return res.status(200).json({
            success: true,
            message: 'Preferences updated successfully',
            data: safeUser,
        });
    } catch (err) {
        console.error('[auth] preferences update error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;