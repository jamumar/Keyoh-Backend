const { Properties, Offers, Users } = require('../models');
const { getSellerHandover } = require('./handoverService');
const { getActiveConversations } = require('../controller/ChatController');

function mapBoostToTier(boost) {
    if (!boost) return null;
    const normalized = String(boost).toLowerCase();
    if (normalized === 'prime') return 'prime';
    if (normalized === 'trending') return 'trending';
    if (normalized === 'seen') return 'seen';
    return null;
}

async function getSellerDashboardStats(sellerId) {
    const properties = await Properties.findAll({
        where: { agent_id: sellerId },
        order: [['createdAt', 'DESC']],
    });

    const property = properties[0] || null;
    const views = properties.reduce((sum, item) => sum + (item.view_count || 0), 0);
    const saves = properties.reduce((sum, item) => sum + (item.like_count || 0), 0);

    // Live chat conversation count for enquiries
    let userConvs = [];
    try {
        if (typeof getActiveConversations === 'function') {
            userConvs = await getActiveConversations(sellerId);
        }
    } catch (e) {}

    const totalEnquiries = userConvs.length;
    const sId = parseInt(sellerId, 10);
    const newEnquiries = userConvs.filter(c => 
        Boolean(c.unread) && 
        parseInt(c.lastSenderId, 10) !== sId &&
        !(Array.isArray(c.readBy) && c.readBy.includes(sId))
    ).length;
    // Fetch received offers
    let offers = [];
    try {
        const rawOffers = await Offers.findAll({
            where: { seller_id: sellerId },
            include: [
                { model: Properties, as: 'property' },
                { model: Users, as: 'buyer' }
            ],
            order: [['createdAt', 'DESC']],
        });

        offers = rawOffers.map(o => {
            const json = o.toJSON ? o.toJSON() : o;
            const amountNum = parseFloat(json.amount || 0);
            const counterNum = json.counter_amount ? parseFloat(json.counter_amount) : null;
            return {
                id: json.id,
                propertyId: json.property_id,
                propertyAddress: json.property?.address || 'Property Listing',
                buyerId: json.buyer_id,
                buyerName: json.buyer_name || json.buyer?.name || 'Buyer',
                amount: `£${amountNum.toLocaleString()}`,
                numericAmount: amountNum,
                counterAmount: counterNum ? `£${counterNum.toLocaleString()}` : null,
                numericCounterAmount: counterNum,
                message: json.message || '',
                responseMessage: json.response_message || '',
                status: json.status,
                receivedAt: 'Just now',
                createdAt: json.createdAt,
            };
        });
    } catch (e) {
        console.warn('[sellerStatsService] Offers query warning:', e.message);
    }

    const pendingHandover = await getSellerHandover(sellerId);

    return {
        property,
        properties,
        views,
        saves,
        total_enquiries: totalEnquiries,
        new_enquiries: newEnquiries,
        offers,
        offer_count: offers.length,
        active_boost: mapBoostToTier(property?.boost),
        pending_handover: pendingHandover?.status === 'pending' ? pendingHandover : null,
        accepted_handover: pendingHandover?.status === 'accepted' ? pendingHandover : null,
    };
}

module.exports = {
    getSellerDashboardStats,
    mapBoostToTier,
};
