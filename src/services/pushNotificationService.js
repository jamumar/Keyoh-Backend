const { Users } = require('../models');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends a single or batch push notification using Expo Push Gateway
 */
async function sendExpoPushNotification({ pushToken, title, body, data = {}, badge = 1, sound = 'default' }) {
  if (!pushToken || typeof pushToken !== 'string') {
    console.log('[PushService] No valid push token provided for push dispatch.');
    return { success: false, reason: 'no_push_token' };
  }

  const cleanTitle = title.startsWith('KEYOH') ? title : `KEYOH | ${title}`;

  const payload = {
    to: pushToken,
    sound,
    title: cleanTitle,
    body,
    badge,
    data: {
      ...data,
      brand: 'KEYOH',
      timestamp: Date.now(),
    },
    priority: 'high',
    channelId: 'keyoh_high_priority',
    _displayInForeground: true,
  };

  console.log(`[PushService] Dispatching push to ${pushToken.slice(0, 15)}... | Title: "${payload.title}"`);

  if (pushToken.startsWith('mock_') || pushToken.includes('dev_token')) {
    console.log('[PushService] Dev Mode Mock Push Delivered:', payload);
    return { success: true, isMock: true, payload };
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    console.log('[PushService] Expo Push API Response:', result);
    return { success: true, result };
  } catch (err) {
    console.error('[PushService] Push dispatch failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches a push notification to a user by recipient UserId
 */
async function sendPushToUser(recipientId, { title, body, data = {}, sound = 'default' }) {
  try {
    if (!recipientId) return { success: false, reason: 'no_recipient_id' };
    const user = await Users.findByPk(recipientId, { attributes: ['id', 'name', 'email', 'push_token'] });
    if (!user || !user.push_token) {
      console.log(`[PushService] User #${recipientId} has no registered push_token. Skipping push.`);
      return { success: false, reason: 'user_has_no_push_token' };
    }

    return await sendExpoPushNotification({
      pushToken: user.push_token,
      title,
      body,
      data,
      sound,
    });
  } catch (err) {
    console.error(`[PushService] Error fetching user #${recipientId} for push:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 1. Chat Push Notification
 */
async function sendChatPushNotification({ recipientId, senderName, messageText, conversationId }) {
  const title = `KEYOH | Message from ${senderName || 'User'}`;
  const body = messageText && messageText.length > 80 ? `${messageText.slice(0, 77)}...` : (messageText || 'Sent you a message.');
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'chat',
      screen: 'ChatRoom',
      conversationId,
      senderName,
      iconName: 'chatbubbles-outline',
    },
  });
}

/**
 * 2. Offer Received Push Notification
 */
async function sendOfferSubmittedPushNotification({ recipientId, buyerName, propertyAddress, offerAmount, offerId, propertyId }) {
  const formattedAmount = typeof offerAmount === 'number' ? `£${offerAmount.toLocaleString('en-GB')}` : String(offerAmount);
  const title = `KEYOH | New Offer Received`;
  const body = `${buyerName || 'A buyer'} submitted an offer of ${formattedAmount} for ${propertyAddress || 'your listing'}.`;
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'offer_received',
      screen: 'OffersTab',
      offerId,
      propertyId,
      iconName: 'pricetag-outline',
    },
  });
}

/**
 * 3. Offer Accepted Push Notification
 */
async function sendOfferAcceptedPushNotification({ recipientId, sellerName, propertyAddress, offerAmount, offerId, propertyId }) {
  const formattedAmount = typeof offerAmount === 'number' ? `£${offerAmount.toLocaleString('en-GB')}` : String(offerAmount);
  const title = `KEYOH | Offer Accepted`;
  const body = `Great news! ${sellerName || 'The seller'} accepted your offer of ${formattedAmount} for ${propertyAddress || 'the property'}.`;
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'offer_accepted',
      screen: 'OfferDetail',
      offerId,
      propertyId,
      iconName: 'checkmark-circle-outline',
    },
  });
}

/**
 * 4. Offer Declined Push Notification
 */
async function sendOfferDeclinedPushNotification({ recipientId, sellerName, propertyAddress, offerId, propertyId }) {
  const title = `KEYOH | Offer Status Update`;
  const body = `Your offer on ${propertyAddress || 'the property'} was declined by ${sellerName || 'the seller'}.`;
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'offer_declined',
      screen: 'OfferDetail',
      offerId,
      propertyId,
      iconName: 'close-circle-outline',
    },
  });
}

/**
 * 5. Counter Offer Push Notification
 */
async function sendCounterOfferPushNotification({ recipientId, sellerName, propertyAddress, counterAmount, offerId, propertyId }) {
  const formattedAmount = typeof counterAmount === 'number' ? `£${counterAmount.toLocaleString('en-GB')}` : String(counterAmount);
  const title = `KEYOH | Counter Offer Received`;
  const body = `${sellerName || 'The seller'} countered with ${formattedAmount} for ${propertyAddress || 'the property'}.`;
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'counter_offer',
      screen: 'OfferDetail',
      offerId,
      propertyId,
      iconName: 'swap-horizontal-outline',
    },
  });
}

/**
 * 6. Moderation / Report Notice
 */
async function sendModerationNoticePushNotification({ recipientId, titleText, messageText, reason }) {
  const title = titleText ? `KEYOH | ${titleText}` : `KEYOH | Moderation Notice`;
  return sendPushToUser(recipientId, {
    title,
    body: messageText || 'Your listing or account has received a moderation notice.',
    data: {
      type: 'moderation_notice',
      screen: 'NotificationsTab',
      reason,
      iconName: 'warning-outline',
    },
  });
}

/**
 * 7. Account Status / Suspension Notice
 */
async function sendAccountStatusPushNotification({ recipientId, status, reason }) {
  const isBanned = status === 'banned' || status === 'suspended';
  const title = isBanned ? `KEYOH | Account Suspended` : `KEYOH | Account Update`;
  const body = isBanned
    ? `Your account was suspended. Reason: ${reason || 'Violation of community safety terms.'}`
    : `Your account status has been updated.`;
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'account_status',
      screen: 'ProfileTab',
      status,
      reason,
      iconName: 'shield-outline',
    },
  });
}

/**
 * 8. Listing Boost Active Push Notification
 */
async function sendBoostActivePushNotification({ recipientId, propertyAddress }) {
  const title = `KEYOH | Feed Boost Active`;
  const body = `Your home ${propertyAddress ? `at ${propertyAddress} ` : ''}is now live at the top of buyer video feeds for 30 days!`;
  return sendPushToUser(recipientId, {
    title,
    body,
    data: {
      type: 'boost_active',
      screen: 'SellerDashboard',
      iconName: 'rocket-outline',
    },
  });
}

module.exports = {
  sendExpoPushNotification,
  sendPushToUser,
  sendChatPushNotification,
  sendOfferSubmittedPushNotification,
  sendOfferAcceptedPushNotification,
  sendOfferDeclinedPushNotification,
  sendCounterOfferPushNotification,
  sendModerationNoticePushNotification,
  sendAccountStatusPushNotification,
  sendBoostActivePushNotification,
};
