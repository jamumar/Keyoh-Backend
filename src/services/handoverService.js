const { Op } = require('sequelize');
const { PropertyHandovers, Users } = require('../models');
const {
    isConfigured,
    getOrCreateDirectChannel,
    upsertStreamUser,
} = require('./getstreamChatService');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function formatHandover(handover) {
    const plain = handover.get ? handover.get({ plain: true }) : handover;
    return {
        id: plain.id,
        seller_id: plain.seller_id,
        agent_name: plain.agent_name,
        agent_email: plain.agent_email,
        agent_id: plain.agent_id,
        status: plain.status,
        referral_fee_pence: plain.referral_fee_pence,
        channel_id: plain.channel_id,
        accepted_at: plain.accepted_at,
        createdAt: plain.createdAt,
        seller: plain.seller
            ? {
                id: plain.seller.id,
                name: plain.seller.name,
                email: plain.seller.email,
            }
            : null,
    };
}

const handoverIncludes = [
    {
        model: Users,
        as: 'seller',
        attributes: ['id', 'name', 'email'],
    },
];

async function createHandoverRequest({ sellerId, agentName, agentEmail }) {
    const normalizedEmail = normalizeEmail(agentEmail);
    const trimmedName = String(agentName || '').trim();

    if (!trimmedName) {
        throw Object.assign(new Error('Agent name is required.'), { statusCode: 400 });
    }

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw Object.assign(new Error('A valid agent email is required.'), { statusCode: 400 });
    }

    const seller = await Users.findByPk(sellerId);
    if (!seller) {
        throw Object.assign(new Error('Seller not found.'), { statusCode: 404 });
    }

    if (normalizeEmail(seller.email) === normalizedEmail) {
        throw Object.assign(new Error('You cannot send a handover request to yourself.'), { statusCode: 400 });
    }

    const existingPending = await PropertyHandovers.findOne({
        where: {
            seller_id: sellerId,
            status: 'pending',
        },
    });

    if (existingPending) {
        throw Object.assign(new Error('You already have a pending handover request.'), { statusCode: 409 });
    }

    const handover = await PropertyHandovers.create({
        seller_id: sellerId,
        agent_name: trimmedName,
        agent_email: normalizedEmail,
        status: 'pending',
    });

    console.log(`[handover] Invitation created for ${normalizedEmail} from seller #${sellerId}`);

    const created = await PropertyHandovers.findByPk(handover.id, { include: handoverIncludes });
    return formatHandover(created);
}

async function getSellerHandover(sellerId) {
    const handover = await PropertyHandovers.findOne({
        where: {
            seller_id: sellerId,
            status: { [Op.in]: ['pending', 'accepted'] },
        },
        include: handoverIncludes,
        order: [['createdAt', 'DESC']],
    });

    return handover ? formatHandover(handover) : null;
}

async function getPendingHandoversForAgent(agentEmail) {
    const normalizedEmail = normalizeEmail(agentEmail);
    const handovers = await PropertyHandovers.findAll({
        where: {
            agent_email: normalizedEmail,
            status: 'pending',
        },
        include: handoverIncludes,
        order: [['createdAt', 'DESC']],
    });

    return handovers.map(formatHandover);
}

async function getAcceptedHandoversForAgent(agentId) {
    const handovers = await PropertyHandovers.findAll({
        where: {
            agent_id: agentId,
            status: 'accepted',
        },
        include: handoverIncludes,
        order: [['accepted_at', 'DESC']],
    });

    return handovers.map(formatHandover);
}

async function createDirectChatChannel(agent, seller) {
    if (!isConfigured()) {
        return null;
    }

    await upsertStreamUser(agent);
    await upsertStreamUser(seller);

    const channel = await getOrCreateDirectChannel({
        initiator: agent,
        recipient: seller,
    });

    return {
        channelId: channel.id,
        channelType: channel.type,
    };
}

async function acceptHandover({ handoverId, agentId, agentEmail }) {
    const normalizedEmail = normalizeEmail(agentEmail);
    const handover = await PropertyHandovers.findByPk(handoverId, { include: handoverIncludes });

    if (!handover) {
        throw Object.assign(new Error('Handover request not found.'), { statusCode: 404 });
    }

    if (handover.status !== 'pending') {
        throw Object.assign(new Error('This handover request is no longer pending.'), { statusCode: 400 });
    }

    if (normalizeEmail(handover.agent_email) !== normalizedEmail) {
        throw Object.assign(new Error('You are not authorised to accept this handover.'), { statusCode: 403 });
    }

    const agent = await Users.findByPk(agentId);
    const seller = await Users.findByPk(handover.seller_id);

    if (!agent || !seller) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404 });
    }

    let channel = null;
    try {
        channel = await createDirectChatChannel(agent, seller);
    } catch (error) {
        console.error('[handover] Failed to create chat channel:', error.message);
    }

    const { Properties } = require('../models');
    handover.status = 'accepted';
    handover.agent_id = agentId;
    handover.accepted_at = new Date();
    if (channel?.channelId) {
        handover.channel_id = channel.channelId;
    }
    await handover.save();

    // Reassign seller listings to the agent
    await Properties.update(
        { agent_id: agentId },
        { where: { agent_id: seller.id } }
    );

    return {
        handover: formatHandover(handover),
        seller: {
            id: seller.id,
            name: seller.name,
            email: seller.email,
        },
        channel,
    };
}

async function declineHandover({ handoverId, agentEmail }) {
    const normalizedEmail = normalizeEmail(agentEmail);
    const handover = await PropertyHandovers.findByPk(handoverId);

    if (!handover) {
        throw Object.assign(new Error('Handover request not found.'), { statusCode: 404 });
    }

    if (handover.status !== 'pending') {
        throw Object.assign(new Error('This handover request is no longer pending.'), { statusCode: 400 });
    }

    if (normalizeEmail(handover.agent_email) !== normalizedEmail) {
        throw Object.assign(new Error('You are not authorised to decline this handover.'), { statusCode: 403 });
    }

    handover.status = 'declined';
    await handover.save();

    const updated = await PropertyHandovers.findByPk(handover.id, { include: handoverIncludes });
    return formatHandover(updated);
}

async function cancelHandover({ handoverId, sellerId }) {
    const handover = await PropertyHandovers.findByPk(handoverId);

    if (!handover) {
        throw Object.assign(new Error('Handover request not found.'), { statusCode: 404 });
    }

    if (handover.seller_id !== sellerId) {
        throw Object.assign(new Error('You are not authorised to cancel this handover.'), { statusCode: 403 });
    }

    if (handover.status !== 'pending') {
        throw Object.assign(new Error('Only pending handover requests can be cancelled.'), { statusCode: 400 });
    }

    handover.status = 'cancelled';
    await handover.save();

    const updated = await PropertyHandovers.findByPk(handover.id, { include: handoverIncludes });
    return formatHandover(updated);
}

module.exports = {
    createHandoverRequest,
    getSellerHandover,
    getPendingHandoversForAgent,
    getAcceptedHandoversForAgent,
    acceptHandover,
    declineHandover,
    cancelHandover,
};
