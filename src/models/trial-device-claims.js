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
    },
    claim_type: {
        type: DataTypes.ENUM('agent', 'seller'),
        allowNull: false,
        defaultValue: 'agent',
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['device_hash', 'claim_type'],
            name: 'trial_device_claims_device_hash_claim_type_unique',
        },
    ],
});

TrialDeviceClaims.associate = function (models) {
    TrialDeviceClaims.belongsTo(models.Users, {
        foreignKey: 'user_id',
        as: 'user',
    });
};

module.exports = TrialDeviceClaims;
