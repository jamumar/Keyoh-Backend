const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const PropertyHandovers = sequelize.define('property_handovers', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    seller_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    agent_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    agent_email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    agent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('pending', 'accepted', 'declined', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
    },
    referral_fee_pence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 25000,
    },
    channel_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    accepted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
});

PropertyHandovers.associate = function (models) {
    PropertyHandovers.belongsTo(models.Users, {
        foreignKey: 'seller_id',
        as: 'seller',
    });
    PropertyHandovers.belongsTo(models.Users, {
        foreignKey: 'agent_id',
        as: 'agent',
    });
};

module.exports = PropertyHandovers;
