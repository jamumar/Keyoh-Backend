const express = require('express');
const router = express.Router();
const { Properties, Users, Conversations, Messages } = require('../models');
const { ChatAuthMiddleware } = require('../middleware');
const { Op } = require('sequelize');
const { sendChatPushNotification } = require('../services/pushNotificationService');

function formatConversation(c) {
    const json = c.toJSON ? c.toJSON() : c;
    const rawMsgs = Array.isArray(json.messages) ? json.messages : [];
    
    // Sort messages in ascending chronological order (oldest first, newest last)
    const sortedRaw = rawMsgs.slice().sort((a, b) => {
        const tA = new Date(a.createdAt || a.timestamp || 0).getTime();
        const tB = new Date(b.createdAt || b.timestamp || 0).getTime();
        if (tA !== tB) return tA - tB;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const msgs = sortedRaw.map(m => ({
        id: m.id,
        senderId: m.sender_id || m.senderId,
        senderName: m.sender_name || m.senderName,
        text: m.text,
        time: m.time,
        createdAt: m.createdAt,
    }));

    return {
        id: json.id,
        homeId: json.home_id,
        homeAddress: json.home_address,
        homePrice: json.home_price,
        buyerId: json.buyer_id,
        buyerName: json.buyer_name,
        sellerId: json.seller_id,
        sellerName: json.seller_name,
        lastSenderId: json.last_sender_id,
        lastMessage: json.last_message,
        lastMessageTime: json.last_message_time,
        unread: json.unread,
        readBy: json.read_by || [],
        messages: msgs,
        updatedAt: json.updatedAt,
    };
}

router.post('/send-message', ChatAuthMiddleware, async (req, res) => {
    try {
        const senderId = parseInt(req.user.id, 10);
        const { recipientId, propertyId, text, propertyAddress, propertyPrice } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Message text cannot be empty.' });
        }

        if (text.length > 2000) {
            return res.status(400).json({ success: false, message: 'Message cannot exceed 2,000 characters.' });
        }

        const sanitizedText = text.replace(/<[^>]*>?/gm, '').trim();

        // Look up property to find real seller (agent_id)
        let propertyOwnerId = null;
        if (propertyId) {
            const property = await Properties.findByPk(propertyId);
            if (property && property.agent_id) {
                propertyOwnerId = parseInt(property.agent_id, 10);
            }
        }

        let targetRecipientId = recipientId ? parseInt(recipientId, 10) : null;
        if (!targetRecipientId) {
            if (propertyOwnerId && propertyOwnerId !== senderId) {
                targetRecipientId = propertyOwnerId;
            } else {
                targetRecipientId = propertyOwnerId || 1;
            }
        }

        const sender = await Users.findByPk(senderId);
        const recipient = await Users.findByPk(targetRecipientId);

        const senderName = sender?.name || 'User';
        const recipientName = recipient?.name || 'User';

        const minId = Math.min(senderId, targetRecipientId);
        const maxId = Math.max(senderId, targetRecipientId);
        const deterministicId = `conv_prop_${propertyId || '1'}_users_${minId}_${maxId}`;

        const isSenderSeller = propertyOwnerId ? senderId === propertyOwnerId : sender?.role === 'seller';
        const sellerId = isSenderSeller ? senderId : targetRecipientId;
        const sellerName = isSenderSeller ? senderName : recipientName;
        const buyerId = isSenderSeller ? targetRecipientId : senderId;
        const buyerName = isSenderSeller ? recipientName : senderName;

        let conv = await Conversations.findByPk(deterministicId, {
            include: [{ model: Messages, as: 'messages' }],
        });

        if (!conv && req.body?.conversationId) {
            conv = await Conversations.findByPk(req.body.conversationId, {
                include: [{ model: Messages, as: 'messages' }],
            });
        }

        console.log(`💬  [CHAT DB]  From #${senderId} (${senderName}) → #${targetRecipientId} (${recipientName}): "${sanitizedText}"`);

        const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        if (!conv) {
            conv = await Conversations.create({
                id: deterministicId,
                home_id: String(propertyId || '1'),
                home_address: propertyAddress || 'Property Address',
                home_price: propertyPrice || '',
                buyer_id: buyerId,
                buyer_name: buyerName,
                seller_id: sellerId,
                seller_name: sellerName,
                last_sender_id: senderId,
                last_message: sanitizedText,
                last_message_time: 'Just now',
                unread: true,
                read_by: [senderId],
            });
        } else {
            conv.last_sender_id = senderId;
            conv.last_message = sanitizedText;
            conv.last_message_time = 'Just now';
            conv.unread = true;
            conv.read_by = [senderId];
            await conv.save();
        }

        const newMsg = await Messages.create({
            id: msgId,
            conversation_id: conv.id,
            sender_id: senderId,
            sender_name: senderName,
            text: sanitizedText,
            time: timeStr,
        });

        // Dispatch push notification to recipient
        sendChatPushNotification({
            recipientId: targetRecipientId,
            senderName: senderName,
            messageText: sanitizedText,
            propertyAddress: conv.home_address,
            conversationId: conv.id,
            propertyId: conv.home_id,
        }).catch(err => console.error('[ChatController] Push dispatch error:', err.message));

        const updatedConv = await Conversations.findByPk(conv.id, {
            include: [{ model: Messages, as: 'messages' }],
        });

        return res.status(200).json({
            success: true,
            data: { conversation: formatConversation(updatedConv), message: newMsg }
        });
    } catch (error) {
        console.error('❌  [CHAT ERROR]', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/read-conversation', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const { conversationId, recipientId } = req.body;

        let conv = null;
        if (conversationId) {
            conv = await Conversations.findByPk(conversationId);
        }

        if (!conv && recipientId) {
            const rId = parseInt(recipientId, 10);
            conv = await Conversations.findOne({
                where: {
                    [Op.or]: [
                        { buyer_id: userId, seller_id: rId },
                        { buyer_id: rId, seller_id: userId },
                    ],
                },
            });
        }

        if (conv) {
            const currentReadBy = Array.isArray(conv.read_by) ? conv.read_by : [];
            if (!currentReadBy.includes(userId)) {
                conv.read_by = [...currentReadBy, userId];
            }
            if (parseInt(conv.last_sender_id, 10) !== userId) {
                conv.unread = false;
            }
            await conv.save();
            console.log(`💬  [CHAT DB]  Conversation ${conv.id} marked as read by user #${userId}`);
        }

        return res.status(200).json({
            success: true,
            data: conv ? formatConversation(conv) : null
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/conversations', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const convs = await Conversations.findAll({
            where: {
                [Op.or]: [
                    { buyer_id: userId },
                    { seller_id: userId },
                ],
            },
            include: [{ model: Messages, as: 'messages' }],
            order: [['updatedAt', 'DESC']],
        });

        const formatted = convs.map(formatConversation);
        return res.status(200).json({
            success: true,
            data: formatted
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/clear', ChatAuthMiddleware, async (req, res) => {
    try {
        await Messages.destroy({ where: {} });
        await Conversations.destroy({ where: {} });
        console.log('🧹 [CHAT DB] Active conversations & messages cleared from database.');
        return res.status(200).json({ success: true, message: 'All conversations cleared' });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

async function getActiveConversations(userId) {
    const uid = parseInt(userId, 10);
    const convs = await Conversations.findAll({
        where: {
            [Op.or]: [
                { buyer_id: uid },
                { seller_id: uid },
            ],
        },
        include: [{ model: Messages, as: 'messages' }],
        order: [['updatedAt', 'DESC']],
    });
    return convs.map(formatConversation);
}

module.exports = router;
module.exports.getActiveConversations = getActiveConversations;
