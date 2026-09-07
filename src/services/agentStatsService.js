const { Properties, Users, AgentStats } = require('../models');
const { getPendingHandoversForAgent } = require('./handoverService');

const DEFAULT_RESPONSE_SCORE = 0;
const DEFAULT_COMPLETION_SCORE = 0;

const RESPONSE_WEIGHT = 0.6;
const COMPLETION_WEIGHT = 0.4;

function scoreFromResponseMinutes(avgMinutes) {
    if (avgMinutes == null) return DEFAULT_RESPONSE_SCORE;
    if (avgMinutes <= 15) return 100;
    if (avgMinutes <= 60) return 90;
    if (avgMinutes <= 240) return 75;
    if (avgMinutes <= 1440) return 50;
    if (avgMinutes <= 2880) return 25;
    return 0;
}

function scoreFromCompletionRate(completionRate, listingCount = 0) {
    if (listingCount === 0 || completionRate == null) return DEFAULT_COMPLETION_SCORE;
    if (completionRate >= 80) return 100;
    if (completionRate >= 60) return 85;
    if (completionRate >= 40) return 70;
    if (completionRate >= 20) return 50;
    return 30;
}

function calculateKeyohScore({ responseTimeScore, completionRate, listingCount, totalEnquiries = 0 }) {
    if (listingCount === 0 && totalEnquiries === 0) {
        return 0;
    }
    const completionScore = scoreFromCompletionRate(completionRate, listingCount);
    const total =
        responseTimeScore * RESPONSE_WEIGHT +
        completionScore * COMPLETION_WEIGHT;

    return Math.min(100, Math.max(0, Math.round(total)));
}

async function getAgentPropertyMetrics(agentId) {
    const properties = await Properties.findAll({
        where: { agent_id: agentId },
    });

    const listingCount = properties.length;
    const totalViews = properties.reduce((sum, property) => sum + (property.view_count || 0), 0);
    const soldCount = properties.filter((property) => property.status === 'sold').length;
    const completionRate = listingCount > 0 ? (soldCount / listingCount) * 100 : 0;

    return {
        properties,
        listingCount,
        totalViews,
        soldCount,
        completionRate,
    };
}

async function recalculateAgentStats(agentId) {
    const {
        listingCount,
        totalViews,
        completionRate,
    } = await getAgentPropertyMetrics(agentId);

    // Calculate real average response time from conversation message history
    let avgResponseMinutes = null;
    let totalEnquiries = 0;
    try {
        const { Messages, Conversations } = require('../models');
        const conversations = await Conversations.findAll({
            where: { seller_id: agentId },
        });
        totalEnquiries = conversations.length;
        if (conversations.length > 0) {
            let totalDiffMinutes = 0;
            let responseCount = 0;
            for (const conv of conversations) {
                const messages = await Messages.findAll({
                    where: { conversation_id: conv.id },
                    order: [['createdAt', 'ASC']],
                });
                for (let i = 0; i < messages.length - 1; i++) {
                    if (messages[i].sender_id !== agentId && messages[i + 1].sender_id === agentId) {
                        const diffMs = new Date(messages[i + 1].createdAt) - new Date(messages[i].createdAt);
                        if (diffMs > 0) {
                            totalDiffMinutes += diffMs / (1000 * 60);
                            responseCount++;
                        }
                    }
                }
            }
            if (responseCount > 0) {
                avgResponseMinutes = Math.round(totalDiffMinutes / responseCount);
            }
        }
    } catch (e) {
        console.warn('[agentStatsService] Response time calculation notice:', e.message);
    }

    const newEnquiries = 0;

    const responseTimeScore = scoreFromResponseMinutes(avgResponseMinutes);
    const keyohScore = calculateKeyohScore({
        responseTimeScore,
        completionRate,
        listingCount,
        totalEnquiries,
    });

    const [stats] = await AgentStats.upsert({
        agent_id: agentId,
        listing_count: listingCount,
        total_views: totalViews,
        total_enquiries: totalEnquiries,
        new_enquiries: newEnquiries,
        avg_response_minutes: avgResponseMinutes,
        avg_review_rating: null,
        completion_rate: completionRate,
        keyoh_score: keyohScore,
        calculated_at: new Date(),
    });

    return stats;
}

async function recalculateAllAgentStats() {
    const agents = await Users.findAll({
        where: { role: 'agent' },
        attributes: ['id'],
    });

    const results = [];
    for (const agent of agents) {
        const stats = await recalculateAgentStats(agent.id);
        results.push(stats);
    }

    console.log(`[agent-stats] Recalculated stats for ${results.length} agents`);
    return results;
}

async function getDashboardStats(agentId, agentEmail) {
    const {
        properties,
        listingCount,
        totalViews,
        completionRate,
    } = await getAgentPropertyMetrics(agentId);

    const stats = await recalculateAgentStats(agentId);

    const pendingHandovers = agentEmail
        ? await getPendingHandoversForAgent(agentEmail)
        : [];

    const hasActivity = Boolean(stats.total_enquiries > 0 || listingCount > 0);

    return {
        keyoh_score: hasActivity ? stats.keyoh_score : null,
        has_activity: hasActivity,
        listing_count: listingCount,
        total_views: totalViews,
        total_enquiries: stats.total_enquiries,
        new_enquiries: stats.new_enquiries,
        completion_rate: completionRate,
        avg_response_minutes: stats.avg_response_minutes,
        calculated_at: stats.calculated_at,
        properties,
        pending_handovers_count: pendingHandovers.length,
        pending_handovers: pendingHandovers,
    };
}

module.exports = {
    calculateKeyohScore,
    recalculateAgentStats,
    recalculateAllAgentStats,
    getDashboardStats,
    scoreFromResponseMinutes,
    scoreFromCompletionRate,
};
