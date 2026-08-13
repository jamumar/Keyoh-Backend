const cron = require('node-cron');
const { recalculateAllAgentStats } = require('../services/agentStatsService');

function startAgentStatsCron() {
    cron.schedule(
        '0 0 * * *',
        async () => {
            try {
                await recalculateAllAgentStats();
            } catch (error) {
                console.error('[agent-stats-cron] Failed:', error.message);
            }
        },
        { timezone: 'Europe/London' }
    );

    console.log('[agent-stats-cron] Scheduled daily at 00:00 Europe/London');
}

module.exports = { startAgentStatsCron };
