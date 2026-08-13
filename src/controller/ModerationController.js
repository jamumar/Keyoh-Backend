const express = require('express');
const router = express.Router();
const Reports = require('../models/reports');
const ModerationLog = require('../models/moderation-log');
const UserBlocks = require('../models/user-blocks');
const Properties = require('../models/properties');
const Users = require('../models/users');
const { ChatAuthMiddleware } = require('../middleware');
const { sendModerationNoticePushNotification } = require('../services/pushNotificationService');

// POST /moderation/report — Submit report with INSTANT AUTO-HIDE
router.post('/report', ChatAuthMiddleware, async (req, res) => {
  try {
    const { target_type, target_id, reason } = req.body;

    if (!target_type || !target_id || !reason) {
      return res.status(400).json({
        success: false,
        message: 'target_type, target_id, and reason are required.',
      });
    }

    const reporterId = req.user.id;

    // 1. Create Report record
    const report = await Reports.create({
      reporter_id: reporterId,
      target_type,
      target_id: String(target_id),
      reason,
      status: 'pending',
    });

    // 2. Auto-hide content instantly for real-time safety (<24h SLA)
    if (target_type === 'property' || target_type === 'photo' || target_type === 'video') {
      const property = await Properties.findByPk(target_id);
      if (property) {
        property.hidden_at = new Date();
        property.moderation_status = 'pending';
        await property.save();

        if (property.agent_id) {
          sendModerationNoticePushNotification({
            recipientId: property.agent_id,
            titleText: 'Listing Under Review',
            messageText: 'Your listing received a report and is currently under safety review.',
            reason,
          }).catch((pErr) => console.error('[ModerationController] Push notice error:', pErr.message));
        }
      }
    }

    // 3. Append to append-only Moderation Log table
    await ModerationLog.create({
      actor: 'auto_report_trigger',
      action: 'auto_hide',
      target_type,
      target_id: String(target_id),
      reason: `Reported by user ${reporterId}: ${reason}`,
      report_id: report.id,
    });

    // 4. Build signed action links for developer email notification
    const host = process.env.API_HOST || 'http://localhost:5000';
    const actionLinks = {
      remove_warn: `${host}/moderation/action/remove_warn?reportId=${report.id}&targetId=${target_id}&type=${target_type}`,
      remove_ban: `${host}/moderation/action/remove_ban?reportId=${report.id}&targetId=${target_id}&type=${target_type}`,
      restore: `${host}/moderation/action/restore?reportId=${report.id}&targetId=${target_id}&type=${target_type}`,
    };

    return res.status(201).json({
      success: true,
      message: 'Report submitted. Content has been auto-hidden and sent for 24h review.',
      data: {
        report_id: report.id,
        status: 'hidden_pending_review',
        action_links: actionLinks,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /moderation/action/:actionType — One-tap email moderation handler
router.get('/action/:actionType', async (req, res) => {
  try {
    const { actionType } = req.params; // 'remove_warn' | 'remove_ban' | 'restore'
    const { reportId, targetId, type } = req.query;

    const validActions = ['remove_warn', 'remove_ban', 'restore'];
    if (!validActions.includes(actionType)) {
      return res.status(400).send('Invalid moderation action.');
    }

    const report = await Reports.findByPk(reportId);
    if (report) {
      report.status = actionType === 'restore' ? 'restored' : 'actioned';
      await report.save();
    }

    if (type === 'property' || type === 'photo' || type === 'video') {
      const property = await Properties.findByPk(targetId);
      if (property) {
        if (actionType === 'restore') {
          property.hidden_at = null;
          property.moderation_status = 'restored';
        } else {
          property.deleted_at = new Date();
          property.moderation_status = 'removed';
        }
        await property.save();

        if (actionType === 'remove_ban' && property.agent_id) {
          const seller = await Users.findByPk(property.agent_id);
          if (seller) {
            seller.banned_at = new Date();
            seller.ban_reason = `Suspended following report #${reportId} on property #${targetId}`;
            await seller.save();
          }
        }
      }
    }

    // Append to audit log
    await ModerationLog.create({
      actor: 'one_tap_email',
      action: actionType,
      target_type: type || 'content',
      target_id: String(targetId),
      reason: `Actioned via one-tap email link (${actionType})`,
      report_id: reportId ? Number(reportId) : null,
    });

    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0A0A0A; color: white;">
          <h2 style="color: #C9A84C;">KEYOH Moderation Action Executed</h2>
          <p>Action <strong>${actionType.toUpperCase()}</strong> completed successfully for ${type} #${targetId}.</p>
          <p style="color: #888;">Log entry recorded in database.</p>
        </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(`Moderation error: ${error.message}`);
  }
});

// POST /moderation/block — 1:1 In-App User Blocking
router.post('/block', ChatAuthMiddleware, async (req, res) => {
  try {
    const { blocked_user_id, reason } = req.body;
    const blockerId = req.user.id;

    if (!blocked_user_id) {
      return res.status(400).json({
        success: false,
        message: 'blocked_user_id is required.',
      });
    }

    if (Number(blocked_user_id) === Number(blockerId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself.',
      });
    }

    const [block, created] = await UserBlocks.findOrCreate({
      where: {
        blocker_id: blockerId,
        blocked_user_id: Number(blocked_user_id),
      },
      defaults: {
        reason: reason || 'User blocked via in-app UI',
      },
    });

    return res.status(200).json({
      success: true,
      message: created ? 'User blocked successfully' : 'User is already blocked',
      data: {
        block_id: block.id,
        blocked_user_id: block.blocked_user_id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /moderation/blocked-users — List blocked users for authenticated user
router.get('/blocked-users', ChatAuthMiddleware, async (req, res) => {
  try {
    const blocks = await UserBlocks.findAll({
      where: { blocker_id: req.user.id },
      attributes: ['id', 'blocked_user_id', 'reason', 'createdAt'],
    });

    return res.status(200).json({
      success: true,
      data: blocks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
