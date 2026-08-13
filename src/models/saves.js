const { sequelize } = require('../lib/db');
const { DataTypes } = require('sequelize');

const Saves = sequelize.define('saves', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'properties',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    }
})

Saves.associate = function (models) {
    Saves.belongsTo(models.Properties, {
        foreignKey: 'property_id',
        as: 'propertyLike'
    });
    Saves.belongsTo(models.Users, {
        foreignKey: 'user_id',
        as: 'savedProperty'
    });
};

module.exports = Saves;