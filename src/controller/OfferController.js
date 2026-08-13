const express = require('express');
const router = express.Router();
const { Offers, Properties, Users, Conversations, Messages } = require('../models');
const { ChatAuthMiddleware, PropertyOwnerMiddleware } = require('../middleware');
const { Op } = require('sequelize');
const {
    sendOfferSubmittedPushNotification,
    sendOfferAcceptedPushNotification,
    sendOfferDeclinedPushNotification,
    sendCounterOfferPushNotification,
} = require('../services/pushNotificationService');

// Helper to format offer object for API responses
function formatOffer(offer) {
    const json = offer.toJSON ? offer.toJSON() : offer;
    const property = json.property || {};
    const buyer = json.buyer || {};
    const seller = json.seller || {};

    const amountNum = parseFloat(json.amount || 0);
    const counterAmountNum = json.counter_amount ? parseFloat(json.counter_amount) : null;

    return {
        id: json.id,
        propertyId: json.property_id,
        propertyAddress: property.address || 'Property Listing',
        propertyPrice: property.price ? `£${property.price}` : '',
        buyerId: json.buyer_id,
        buyerName: json.buyer_name || buyer.name || 'Buyer',
        buyerEmail: buyer.email || '',
        sellerId: json.seller_id,
        sellerName: seller.name || 'Seller',
        amount: amountNum,
        formattedAmount: `£${amountNum.toLocaleString()}`,
        counterAmount: counterAmountNum,
        formattedCounterAmount: counterAmountNum ? `£${counterAmountNum.toLocaleString()}` : null,
        message: json.message || '',
        responseMessage: json.response_message || '',
        status: json.status,
        acceptedAt: json.accepted_at,
        completedAt: json.completed_at,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
    };
}

// Helper to push system notifications into direct chat conversation
async function appendSystemChatMessage({ buyerId, sellerId, propertyId, propertyAddress, propertyPrice, text }) {
    try {
        const minId = Math.min(buyerId, sellerId);
        const maxId = Math.max(buyerId, sellerId);
        const convId = `conv_prop_${propertyId || '1'}_users_${minId}_${maxId}`;

        const sender = await Users.findByPk(buyerId);
        const recipient = await Users.findByPk(sellerId);

        let conv = await Conversations.findByPk(convId);
        if (!conv) {
            conv = await Conversations.create({
                id: convId,
                home_id: String(propertyId || '1'),
                home_address: propertyAddress || 'Property Address',
                home_price: propertyPrice || '',
                buyer_id: buyerId,
                buyer_name: sender?.name || 'Buyer',
                seller_id: sellerId,
                seller_name: recipient?.name || 'Seller',
                last_sender_id: buyerId,
                last_message: text,
                last_message_time: 'Just now',
                unread: true,
                read_by: [buyerId],
            });
        } else {
            conv.last_sender_id = buyerId;
            conv.last_message = text;
            conv.last_message_time = 'Just now';
            conv.unread = true;
            conv.read_by = [buyerId];
            await conv.save();
        }

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        await Messages.create({
            id: msgId,
            conversation_id: conv.id,
            sender_id: buyerId,
            sender_name: sender?.name || 'System',
            text,
            time: timeStr,
        });
    } catch (e) {
        console.warn('⚠️  [OfferController] Chat notification push error:', e.message);
    }
}

// 1. Submit a new offer (Buyer auth)
router.post('/', ChatAuthMiddleware, async (req, res) => {
    try {
        const buyerId = parseInt(req.user.id, 10);
        const { propertyId, amount, message } = req.body;

        if (!propertyId) {
            return res.status(400).json({ success: false, message: 'propertyId is required' });
        }

        const numericAmount = parseFloat(String(amount || '').replace(/[^0-9.]/g, ''));
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid offer amount is required' });
        }

        const property = await Properties.findByPk(propertyId);
        if (!property) {
            return res.status(404).json({ success: false, message: 'Property listing not found' });
        }

        const sellerId = parseInt(property.agent_id, 10);
        if (sellerId === buyerId) {
            return res.status(400).json({ success: false, message: 'You cannot submit an offer on your own listing' });
        }

        const buyer = await Users.findByPk(buyerId);

        // Check if buyer has an existing offer on this property
        const existingOffer = await Offers.findOne({
            where: {
                property_id: property.id,
                buyer_id: buyerId,
            },
        });

        if (existingOffer) {
            if (existingOffer.status === 'accepted' || existingOffer.status === 'completed_sold') {
                return res.status(400).json({
                    success: false,
                    message: 'Your offer has already been accepted on this property.',
                });
            }

            // Update existing offer with revised amount and message
            existingOffer.amount = numericAmount;
            existingOffer.message = message ? message.trim() : null;
            existingOffer.counter_amount = null;
            existingOffer.status = 'pending';
            existingOffer.response_message = null;
            await existingOffer.save();

            const formatted = formatOffer(await Offers.findByPk(existingOffer.id, {
                include: [
                    { model: Properties, as: 'property' },
                    { model: Users, as: 'buyer' },
                    { model: Users, as: 'seller' },
                ]
            }));

            // Send chat notification for revised offer
            const offerText = `OFFER REVISED: £${numericAmount.toLocaleString()}${message ? `\n\n"${message.trim()}"` : ''}`;
            await appendSystemChatMessage({
                buyerId,
                sellerId,
                propertyId: property.id,
                propertyAddress: property.address,
                propertyPrice: `£${property.price}`,
                text: offerText,
            });

            console.log(`[offer] Buyer #${buyerId} updated offer to £${numericAmount} on property #${property.id}`);

            return res.status(200).json({
                success: true,
                message: 'Offer updated successfully',
                data: formatted,
            });
        }

        // Create new offer record
        const newOffer = await Offers.create({
            property_id: property.id,
            buyer_id: buyerId,
            buyer_name: buyer?.name || 'Buyer',
            seller_id: sellerId,
            amount: numericAmount,
            message: message ? message.trim() : null,
            status: 'pending',
        });

        const formatted = formatOffer(await Offers.findByPk(newOffer.id, {
            include: [
                { model: Properties, as: 'property' },
                { model: Users, as: 'buyer' },
                { model: Users, as: 'seller' },
            ]
        }));

        // Send chat notification
        const offerText = `OFFER SUBMITTED: £${numericAmount.toLocaleString()}${message ? `\n\n"${message.trim()}"` : ''}`;
        await appendSystemChatMessage({
            buyerId,
            sellerId,
            propertyId: property.id,
            propertyAddress: property.address,
            propertyPrice: `£${property.price}`,
            text: offerText,
        });

        // Dispatch push notification to seller
        sendOfferSubmittedPushNotification({
            recipientId: sellerId,
            buyerName: buyer?.name || 'A buyer',
            propertyAddress: property.address,
            offerAmount: numericAmount,
            offerId: formatted.id,
            propertyId: property.id,
        }).catch((err) => console.error('[OfferController] Push dispatch error:', err.message));

        console.log(`[offer] Buyer #${buyerId} submitted offer of £${numericAmount} on property #${property.id}`);

        return res.status(201).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        console.error('[offer:error]', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 2. Get received offers for seller/agent properties
router.get('/received', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);

        const offers = await Offers.findAll({
            where: { seller_id: userId },
            include: [
                { model: Properties, as: 'property' },
                { model: Users, as: 'buyer' },
            ],
            order: [['createdAt', 'DESC']],
        });

        const formatted = offers.map(formatOffer);

        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 3. Get offers submitted by buyer
router.get('/my-offers', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);

        const offers = await Offers.findAll({
            where: { buyer_id: userId },
            include: [
                { model: Properties, as: 'property' },
                { model: Users, as: 'seller' },
            ],
            order: [['createdAt', 'DESC']],
        });

        const formatted = offers.map(formatOffer);

        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 4. Accept an offer (Seller auth)
router.post('/:id/accept', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const offerId = req.params.id;

        const offer = await Offers.findByPk(offerId, {
            include: [{ model: Properties, as: 'property' }]
        });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        if (parseInt(offer.seller_id, 10) !== userId) {
            return res.status(403).json({ success: false, message: 'Only the listing owner can accept this offer' });
        }

        offer.status = 'accepted';
        offer.accepted_at = new Date();
        if (req.body?.message) {
            offer.response_message = req.body.message.trim();
        }
        await offer.save();

        // Update property status to under_offer
        if (offer.property) {
            offer.property.status = 'under_offer';
            await offer.property.save();
        }

        const formatted = formatOffer(offer);

        // Notify chat
        const acceptText = `OFFER ACCEPTED!\n\nYour offer of ${formatted.formattedAmount} for ${formatted.propertyAddress} was ACCEPTED by the seller!\n\nLegal Next Step: Please instruct your solicitors to proceed with conveyancing.`;
        await appendSystemChatMessage({
            buyerId: offer.buyer_id,
            sellerId: offer.seller_id,
            propertyId: offer.property_id,
            propertyAddress: formatted.propertyAddress,
            propertyPrice: formatted.propertyPrice,
            text: acceptText,
        });

        // Dispatch push notification to buyer
        sendOfferAcceptedPushNotification({
            recipientId: offer.buyer_id,
            sellerName: offer.seller_name || 'The seller',
            propertyAddress: formatted.propertyAddress,
            offerAmount: formatted.amount,
            offerId: offer.id,
            propertyId: offer.property_id,
        }).catch((err) => console.error('[OfferController] Push accept error:', err.message));

        console.log(`🎉  [OFFER ACCEPTED] Offer #${offer.id} accepted for property #${offer.property_id}`);

        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 5. Reject / decline an offer
router.post('/:id/reject', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const offerId = req.params.id;

        const offer = await Offers.findByPk(offerId, {
            include: [{ model: Properties, as: 'property' }]
        });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        if (parseInt(offer.seller_id, 10) !== userId) {
            return res.status(403).json({ success: false, message: 'Only the listing owner can reject this offer' });
        }

        offer.status = 'rejected';
        if (req.body?.message) {
            offer.response_message = req.body.message.trim();
        }
        await offer.save();

        const formatted = formatOffer(offer);

        const rejectText = `Offer of ${formatted.formattedAmount} for ${formatted.propertyAddress} was declined by the seller.`;
        await appendSystemChatMessage({
            buyerId: offer.buyer_id,
            sellerId: offer.seller_id,
            propertyId: offer.property_id,
            propertyAddress: formatted.propertyAddress,
            propertyPrice: formatted.propertyPrice,
            text: rejectText,
        });

        // Dispatch push notification to buyer
        sendOfferDeclinedPushNotification({
            recipientId: offer.buyer_id,
            sellerName: offer.seller_name || 'The seller',
            propertyAddress: formatted.propertyAddress,
            offerId: offer.id,
            propertyId: offer.property_id,
        }).catch((err) => console.error('[OfferController] Push reject error:', err.message));

        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 6. Counter an offer (Seller submits counter amount)
router.post('/:id/counter', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const offerId = req.params.id;
        const { counterAmount, message } = req.body;

        const numericCounter = parseFloat(String(counterAmount || '').replace(/[^0-9.]/g, ''));
        if (isNaN(numericCounter) || numericCounter <= 0) {
            return res.status(400).json({ success: false, message: 'Valid counter offer amount is required' });
        }

        const offer = await Offers.findByPk(offerId, {
            include: [{ model: Properties, as: 'property' }]
        });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        if (parseInt(offer.seller_id, 10) !== userId) {
            return res.status(403).json({ success: false, message: 'Only the listing owner can counter this offer' });
        }

        offer.counter_amount = numericCounter;
        offer.status = 'countered';
        if (message) {
            offer.response_message = message.trim();
        }
        await offer.save();

        const formatted = formatOffer(offer);

        const counterText = `COUNTER OFFER RECEIVED!\n\nThe seller counter-offered ${formatted.formattedCounterAmount} for ${formatted.propertyAddress}${message ? `\n\n"${message.trim()}"` : ''}`;
        await appendSystemChatMessage({
            buyerId: offer.buyer_id,
            sellerId: offer.seller_id,
            propertyId: offer.property_id,
            propertyAddress: formatted.propertyAddress,
            propertyPrice: formatted.propertyPrice,
            text: counterText,
        });

        // Dispatch push notification to buyer
        sendCounterOfferPushNotification({
            recipientId: offer.buyer_id,
            sellerName: offer.seller_name || 'The seller',
            propertyAddress: formatted.propertyAddress,
            counterAmount: numericCounter,
            offerId: offer.id,
            propertyId: offer.property_id,
        }).catch((err) => console.error('[OfferController] Push counter error:', err.message));

        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 7. Complete deal / Mark property as SOLD (Frees 1-active-listing slot for Private Seller)
router.post('/:id/complete', ChatAuthMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.user.id, 10);
        const offerId = req.params.id;

        const offer = await Offers.findByPk(offerId, {
            include: [{ model: Properties, as: 'property' }]
        });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        if (parseInt(offer.seller_id, 10) !== userId) {
            return res.status(403).json({ success: false, message: 'Only the listing owner can complete this sale' });
        }

        offer.status = 'completed_sold';
        offer.completed_at = new Date();
        await offer.save();

        // Mark property as sold!
        if (offer.property) {
            offer.property.status = 'sold';
            offer.property.sold_at = new Date();
            await offer.property.save();
        }

        const formatted = formatOffer(offer);

        const soldText = `PROPERTY SOLD: The sale of ${formatted.propertyAddress} for ${formatted.formattedAmount} has completed successfully. Congratulations!`;
        await appendSystemChatMessage({
            buyerId: offer.buyer_id,
            sellerId: offer.seller_id,
            propertyId: offer.property_id,
            propertyAddress: formatted.propertyAddress,
            propertyPrice: formatted.propertyPrice,
            text: soldText,
        });

        console.log(`[property:sold] Property #${offer.property_id} marked as SOLD. Seller #${userId} slot unlocked.`);

        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
