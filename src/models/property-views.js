const { sequelize } = require('../lib/db');
const { DataTypes } = require('sequelize');

const PropertyViews = sequelize.define('property-views', {
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
    },
})

PropertyViews.associate = function (models) {
    PropertyViews.belongsTo(models.Properties, {
        foreignKey: 'property_id',
        as: 'propertyView'
    });
    PropertyViews.belongsTo(models.Users, {
        foreignKey: 'user_id',
        as: 'userView'
    });
};

module.exports = PropertyViews;