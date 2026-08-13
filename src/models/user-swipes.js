const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const UserSwipes = sequelize.define('user_swipes', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    action: {
        type: DataTypes.ENUM('like', 'pass'),
        allowNull: false,
    },
});

UserSwipes.associate = function (models) {
    UserSwipes.belongsTo(models.Users, {
        foreignKey: 'user_id',
        as: 'user',
    });
    UserSwipes.belongsTo(models.Properties, {
        foreignKey: 'property_id',
        as: 'property',
    });
};

module.exports = UserSwipes;
