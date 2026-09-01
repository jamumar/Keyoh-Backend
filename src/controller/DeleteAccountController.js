const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Users = require('../models/users');
const Properties = require('../models/properties');
const { ChatAuthMiddleware } = require('../middleware');
const { sendEmail, buildDeleteAccountRequestEmail } = require('../services/emailService');

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'contact@keyoh.co.uk';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// DELETE /delete-account — Authenticated in-app instant account deletion (Apple Guideline 5.1.1(v))
router.delete('/', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const user = await Users.findByPk(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Account not found.',
            });
        }

        // Anonymize/Deactivate user listings
        await Properties.update(
            { status: 'deleted', deleted_at: new Date(), hidden_at: new Date() },
            { where: { agent_id: userId } }
        );

        // Delete user record
        await user.destroy();
        console.log(`[Account] ✓ Permanently deleted User #${userId} (${user.email})`);

        return res.status(200).json({
            success: true,
            message: 'Your account and associated personal data have been permanently deleted.',
        });
    } catch (error) {
        console.error('[Account] Delete error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Could not process account deletion at this time. Please try again or contact support.',
        });
    }
});

// POST /delete-account — Web request / unauthenticated support deletion request
router.post('/', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();

        if (!email || !EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.',
            });
        }

        const user = await Users.findOne({
            where: { email: { [Op.eq]: email } },
            attributes: ['id', 'email', 'name', 'role'],
        });

        const emailContent = buildDeleteAccountRequestEmail(email);
        await sendEmail({
            to: SUPPORT_EMAIL,
            subject: emailContent.subject,
            html: emailContent.html,
            text: [
                emailContent.text,
                '',
                user
                    ? `Matched account: id=${user.id}, name=${user.name}, role=${user.role}`
                    : 'No matching KEYOH account found for this email.',
            ].join('\n'),
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            message: 'Your deletion request has been submitted. We will process it within 7 days.',
        });
    } catch (error) {
        console.error('Delete account request error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Could not submit your request right now. Please email contact@keyoh.co.uk.',
        });
    }
});

module.exports = router;
