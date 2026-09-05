require('dotenv').config();
const { sequelize } = require('./src/lib/db');
const {
  Users,
  Properties,
  Offers,
  Reports,
  UserBlocks,
  Saves,
  PropertyViews,
  UserSwipes,
  UserBillings,
  Messages,
  Conversations,
  PasswordResets,
  PropertyHandovers,
  PartnerReferralLeads,
  PartnerClickLogs,
  AgentStats,
  VideographerRequests,
} = require('./src/models');

async function deleteAllUsers() {
  console.log('[DELETE ALL USERS] ⚠️ Starting full user & activity purge...');
  try {
    await sequelize.authenticate();
    console.log('[DELETE ALL USERS] ✓ Database connected.');

    // Remove all child/activity tables first to respect foreign keys
    console.log('[DELETE ALL USERS] Purging activity & relation records...');
    if (Offers) await Offers.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Offers.destroy({ where: {} }));
    if (UserSwipes) await UserSwipes.destroy({ where: {}, truncate: true, cascade: true }).catch(() => UserSwipes.destroy({ where: {} }));
    if (Saves) await Saves.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Saves.destroy({ where: {} }));
    if (PropertyViews) await PropertyViews.destroy({ where: {}, truncate: true, cascade: true }).catch(() => PropertyViews.destroy({ where: {} }));
    if (Reports) await Reports.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Reports.destroy({ where: {} }));
    if (UserBlocks) await UserBlocks.destroy({ where: {}, truncate: true, cascade: true }).catch(() => UserBlocks.destroy({ where: {} }));
    if (UserBillings) await UserBillings.destroy({ where: {}, truncate: true, cascade: true }).catch(() => UserBillings.destroy({ where: {} }));
    if (Messages) await Messages.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Messages.destroy({ where: {} }));
    if (Conversations) await Conversations.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Conversations.destroy({ where: {} }));
    if (PasswordResets) await PasswordResets.destroy({ where: {}, truncate: true, cascade: true }).catch(() => PasswordResets.destroy({ where: {} }));
    if (PropertyHandovers) await PropertyHandovers.destroy({ where: {}, truncate: true, cascade: true }).catch(() => PropertyHandovers.destroy({ where: {} }));
    if (PartnerReferralLeads) await PartnerReferralLeads.destroy({ where: {}, truncate: true, cascade: true }).catch(() => PartnerReferralLeads.destroy({ where: {} }));
    if (PartnerClickLogs) await PartnerClickLogs.destroy({ where: {}, truncate: true, cascade: true }).catch(() => PartnerClickLogs.destroy({ where: {} }));
    if (AgentStats) await AgentStats.destroy({ where: {}, truncate: true, cascade: true }).catch(() => AgentStats.destroy({ where: {} }));
    if (VideographerRequests) await VideographerRequests.destroy({ where: {}, truncate: true, cascade: true }).catch(() => VideographerRequests.destroy({ where: {} }));

    // Delete all properties
    console.log('[DELETE ALL USERS] Purging all properties...');
    if (Properties) await Properties.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Properties.destroy({ where: {} }));

    // Delete all users (sellers, buyers, agents, etc.)
    console.log('[DELETE ALL USERS] Purging all users (buyers, sellers, agents)...');
    const userCount = await Users.destroy({ where: {}, truncate: true, cascade: true }).catch(() => Users.destroy({ where: {} }));

    console.log(`[DELETE ALL USERS] ✅ Success! All users, properties, offers, chats, and records have been deleted.`);
    process.exit(0);
  } catch (error) {
    console.error('[DELETE ALL USERS] ❌ Error deleting users:', error);
    process.exit(1);
  }
}

deleteAllUsers();
