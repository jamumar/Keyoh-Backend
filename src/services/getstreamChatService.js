const { StreamChat } = require('stream-chat');

let serverClient = null;

function isConfigured() {
    return Boolean(process.env.GETSTREAM_API_KEY && process.env.GETSTREAM_API_SECRET);
}

function getServerClient() {
    if (!isConfigured()) {
        throw new Error('GetStream is not configured. Set GETSTREAM_API_KEY and GETSTREAM_API_SECRET.');
    }

    if (!serverClient) {
        serverClient = StreamChat.getInstance(
            process.env.GETSTREAM_API_KEY,
            process.env.GETSTREAM_API_SECRET
        );
    }

    return serverClient;
}

function getStreamUserId(userId) {
    return `keyoh-${userId}`;
}

async function upsertStreamUser(user) {
    const client = getServerClient();

    await client.upsertUser({
        id: getStreamUserId(user.id),
        name: user.name,
        email: user.email,
        keyoh_role: user.role,
    });
}

function createUserToken(userId) {
    const client = getServerClient();
    return client.createToken(getStreamUserId(userId));
}

function buildPropertyChannelId(propertyId, memberStreamIds) {
    const sortedMembers = [...memberStreamIds].sort();
    return `property-${propertyId}-${sortedMembers.join('-')}`;
}

function buildDirectChannelId(memberStreamIds) {
    const sortedMembers = [...memberStreamIds].sort();
    return `direct-${sortedMembers.join('-')}`;
}

async function ensureChannel(channel) {
    try {
        await channel.create();
    } catch (error) {
        await channel.query({
            state: true,
            watch: false,
            messages: { limit: 1 },
        });
    }

    return channel;
}

async function getOrCreatePropertyChannel({ property, initiator, recipient }) {
    const client = getServerClient();
    const initiatorStreamId = getStreamUserId(initiator.id);
    const recipientStreamId = getStreamUserId(recipient.id);
    const channelId = buildPropertyChannelId(property.id, [initiatorStreamId, recipientStreamId]);

    const channel = client.channel('messaging', channelId, {
        members: [initiatorStreamId, recipientStreamId],
        created_by_id: initiatorStreamId,
        property_id: property.id,
        property_address: property.address,
        property_price: `£${Number(property.price).toLocaleString('en-GB')}`,
        property_image: property.images?.[0] || null,
        recipient_name: recipient.name,
        recipient_id: recipient.id,
        recipient_role: recipient.role,
    });

    await ensureChannel(channel);
    return channel;
}

async function getOrCreateDirectChannel({ initiator, recipient }) {
    const client = getServerClient();
    const initiatorStreamId = getStreamUserId(initiator.id);
    const recipientStreamId = getStreamUserId(recipient.id);
    const channelId = buildDirectChannelId([initiatorStreamId, recipientStreamId]);

    const channel = client.channel('messaging', channelId, {
        members: [initiatorStreamId, recipientStreamId],
        created_by_id: initiatorStreamId,
        recipient_name: recipient.name,
        recipient_id: recipient.id,
        recipient_role: recipient.role,
    });

    await ensureChannel(channel);
    return channel;
}

module.exports = {
    isConfigured,
    getStreamUserId,
    upsertStreamUser,
    createUserToken,
    getOrCreatePropertyChannel,
    getOrCreateDirectChannel,
};
