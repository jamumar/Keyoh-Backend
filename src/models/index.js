const Properties = require('./properties');
const PropertyType = require('./propery-types');
const TenureType = require('./tenure-types');
const Users = require('./users');
const PropertyViews = require('./property-views');
const Likes = require('./saves');
const AgentStats = require('./agent-stats');
const UserBillings = require('./user-billings');
const PropertyHandovers = require('./property-handovers');
const PasswordReset = require('./password-resets');
const PartnerClickLogs = require('./partner-click-logs');
const PartnerReferralLeads = require('./partner-referral-leads');
const Reports = require('./reports');
const ModerationLog = require('./moderation-log');
const UserBlocks = require('./user-blocks');
const Conversations = require('./conversations');
const Messages = require('./messages');
const Offers = require('./offers');
const VideographerRequests = require('./videographer-requests');
const UserSwipes = require('./user-swipes');

const models = {
    Properties,
    PropertyType,
    TenureType,
    Users,
    PropertyViews,
    Saves: Likes,
    AgentStats,
    UserBillings,
    PropertyHandovers,
    PasswordReset,
    PartnerClickLogs,
    PartnerReferralLeads,
    Reports,
    ModerationLog,
    UserBlocks,
    Conversations,
    Messages,
    Offers,
    VideographerRequests,
    UserSwipes,
};

// Run associations
Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
        models[modelName].associate(models);
    }
});

module.exports = models;
