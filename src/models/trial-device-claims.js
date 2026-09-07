const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const TrialDeviceClaims = sequelize.define('trial_device_claims', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    device_hash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

TrialDeviceClaims.associate = function (models) {
    TrialDeviceClaims.belongsTo(models.Users, {
        foreignKey: 'user_id',
        as: 'user',
    });
};

module.exports = TrialDeviceClaims;
