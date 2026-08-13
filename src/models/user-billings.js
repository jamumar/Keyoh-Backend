const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const UserBillings = sequelize.define('user_billings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    revenue_cat_app_user_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    product_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    package_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    offering_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    entitlement_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    billing_period: {
        type: DataTypes.ENUM('one_time', 'monthly', 'annual'),
        allowNull: false,
        defaultValue: 'one_time',
    },
    status: {
        type: DataTypes.ENUM('active', 'trialing', 'expired', 'cancelled', 'grace_period'),
        allowNull: false,
        defaultValue: 'active',
    },
    start_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    expire_date: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    will_renew: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    store: {
        type: DataTypes.ENUM('app_store', 'play_store', 'stripe', 'promotional', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown',
    },
    is_trial: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
});

UserBillings.associate = function (models) {
    UserBillings.belongsTo(models.Users, {
        foreignKey: 'user_id',
        as: 'user',
    });
};

module.exports = UserBillings;
