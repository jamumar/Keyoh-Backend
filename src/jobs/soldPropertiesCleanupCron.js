const cron = require('node-cron');
const { Properties } = require('../models');
const { Op } = require('sequelize');

/**
 * Automatically purges / soft-deletes sold properties after 30 days in sold status
 */
async function purgeExpiredSoldProperties() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const expiredSoldProperties = await Properties.findAll({
      where: {
        status: 'sold',
        deleted_at: null,
        [Op.or]: [
          { sold_at: { [Op.lte]: thirtyDaysAgo } },
          {
            sold_at: null,
            updatedAt: { [Op.lte]: thirtyDaysAgo },
          },
        ],
      },
    });

    if (expiredSoldProperties.length === 0) {
      return 0;
    }

    const now = new Date();
    for (const prop of expiredSoldProperties) {
      prop.deleted_at = now;
      await prop.save();
    }

    console.log(`[cron] Soft-deleted ${expiredSoldProperties.length} sold property listing(s) older than 30 days.`);
    return expiredSoldProperties.length;
  } catch (error) {
    console.error('[cron] Purge expired sold properties failed:', error.message);
    throw error;
  }
}

function startSoldPropertiesCleanupCron() {
  cron.schedule(
    '30 3 * * *',
    async () => {
      try {
        await purgeExpiredSoldProperties();
      } catch (error) {
        console.error('[cron] Sold properties cleanup cron error:', error.message);
      }
    },
    { timezone: 'Europe/London' }
  );

  console.log('[cron] 30-Day Sold Properties Auto-Cleanup Cron scheduled daily at 03:30 AM Europe/London');
}

module.exports = {
  startSoldPropertiesCleanupCron,
  purgeExpiredSoldProperties,
};
