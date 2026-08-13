const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const AgentStats = sequelize.define('agent_stats', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    agent_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
    },
    listing_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    total_views: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    total_enquiries: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    new_enquiries: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    avg_response_minutes: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    avg_review_rating: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    completion_rate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    keyoh_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 70,
    },
    calculated_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
});

AgentStats.associate = function (models) {
    AgentStats.belongsTo(models.Users, {
        foreignKey: 'agent_id',
        as: 'agent',
    });
};

module.exports = AgentStats;
