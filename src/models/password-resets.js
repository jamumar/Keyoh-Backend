const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const PasswordReset = sequelize.define('password_resets', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
});

module.exports = PasswordReset;
