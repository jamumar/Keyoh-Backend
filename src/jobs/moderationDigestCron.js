const { Reports, Properties } = require('../models');
const { Op } = require('sequelize');
const { sendEmail } = require('../services/emailService');

/**
 * Moderation SLA Digest Cron Job
 * Checks for unreviewed reported listings older than 20 hours (<24h SLA compliance).
 * Sends an email notification digest to the admin/support team if pending items exist.
 */
async function runModerationDigestCheck() {
    try {
        const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);

        const pendingReports = await Reports.findAll({
            where: {
                status: 'pending',
                createdAt: {
                    [Op.lte]: twentyHoursAgo,
                },
            },
            include: [
                {
                    model: Properties,
                    as: 'property',
                    attributes: ['id', 'address', 'post_code', 'price', 'status'],
                },
            ],
            order: [['createdAt', 'ASC']],
        });

        if (pendingReports.length === 0) {
            console.log('[cron:moderationDigest] Zero SLA warnings. All reported content clean.');
            return;
        }

        console.log(`[cron:moderationDigest] SLA Alert: ${pendingReports.length} pending report(s) >20h old.`);

        const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'support@keyoh.app';
        const reportListHtml = pendingReports.map(r => `
            <li>
                <strong>Report #${r.id}</strong> — Reason: <em>${r.reason}</em> (Submitted: ${new Date(r.createdAt).toLocaleString('en-GB')})<br>
                Property ID: ${r.property_id} — ${r.property?.address || 'N/A'}<br>
            </li>
        `).join('');

        sendEmail({
            to: adminEmail,
            subject: `[KEYOH SLA ALERT] ${pendingReports.length} Content Report(s) Approaching 24h SLA`,
            html: `
                <h2>KEYOH Content Moderation SLA Alert</h2>
                <p>The following reported items have been pending review for over 20 hours and require immediate action to maintain <24h SLA compliance:</p>
                <ul>${reportListHtml}</ul>
                <p>Please log in to the moderation portal to review and take action.</p>
            `,
            text: `KEYOH SLA ALERT: ${pendingReports.length} pending content report(s) older than 20 hours.`,
        }).catch(err => {
            console.error('[cron:moderationDigest] Failed to send admin email:', err.message);
        });

    } catch (error) {
        console.error('[cron:moderationDigest] Error running digest check:', error.message);
    }
}

function startModerationDigestCron() {
    console.log('[cron:moderationDigest] Moderation SLA digest cron initialized (runs every 4 hours)');
    setTimeout(() => {
        runModerationDigestCheck();
    }, 15000);

    setInterval(() => {
        runModerationDigestCheck();
    }, 4 * 60 * 60 * 1000);
}

module.exports = {
    startModerationDigestCron,
    runModerationDigestCheck,
};
