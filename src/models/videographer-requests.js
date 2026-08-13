const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const VideographerRequests = sequelize.define('videographer_requests', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    seller_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    requested_date: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    preferred_time: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    contact_phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
    },
});

VideographerRequests.associate = function (models) {
    VideographerRequests.belongsTo(models.Users, {
        foreignKey: 'seller_id',
        as: 'seller',
    });
    VideographerRequests.belongsTo(models.Properties, {
        foreignKey: 'property_id',
        as: 'property',
    });
};

module.exports = VideographerRequests;
