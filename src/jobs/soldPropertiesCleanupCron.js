const cron = require('node-cron');
const { Properties } = require('../models');
const { Op } = require('sequelize');

/**
 * Automatically hides sold properties from feed 6 months (180 days) after sold date.
 * Record is permanently preserved in database for reporting and metrics (deleted_at remains null).
 */
async function purgeExpiredSoldProperties() {
  try {
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const expiredSoldProperties = await Properties.findAll({
      where: {
        status: 'sold',
        hidden_at: null,
        deleted_at: null,
        [Op.or]: [
          { sold_at: { [Op.lte]: sixMonthsAgo } },
          {
            sold_at: null,
            updatedAt: { [Op.lte]: sixMonthsAgo },
          },
        ],
      },
    });

    if (expiredSoldProperties.length === 0) {
      return 0;
    }

    const now = new Date();
    for (const prop of expiredSoldProperties) {
      prop.hidden_at = now;
      await prop.save();
    }

    console.log(`[cron] Auto-archived ${expiredSoldProperties.length} sold property listing(s) older than 6 months (hidden from feed, preserved in DB).`);
    return expiredSoldProperties.length;
  } catch (error) {
    console.error('[cron] Archive expired sold properties failed:', error.message);
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

  console.log('[cron] 6-Month Sold Properties Feed Auto-Archive Cron scheduled daily at 03:30 AM Europe/London');
}

module.exports = {
  startSoldPropertiesCleanupCron,
  purgeExpiredSoldProperties,
};
