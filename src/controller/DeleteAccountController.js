const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Users = require('../models/users');
const { sendEmail, buildDeleteAccountRequestEmail } = require('../services/emailService');

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'contact@keyoh.co.uk';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
            where: {
                email: { [Op.eq]: email },
            },
            attributes: ['id', 'email', 'name', 'role'],
        });

        // Case-insensitive fallback for older accounts
        const matchedUser = user || await Users.findOne({
            where: {
                email: { [Op.like]: email },
            },
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
                matchedUser
                    ? `Matched account: id=${matchedUser.id}, name=${matchedUser.name}, role=${matchedUser.role}`
                    : 'No matching KEYOH account found for this email.',
            ].join('\n'),
        });

        return res.status(200).json({
            success: true,
            message: 'Your deletion request has been submitted. We will process it within 7 days.',
        });
    } catch (error) {
        console.error('Delete account request error:', error);
        return res.status(500).json({
            success: false,
            message: 'Could not submit your request right now. Please email contact@keyoh.co.uk.',
        });
    }
});

module.exports = router;
