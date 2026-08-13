const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db')

const PropertyType = sequelize.define('property-types', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        allowNull: false
    }
})

PropertyType.associate = function (models) {
    PropertyType.hasMany(models.Properties, {
        foreignKey: 'property_type_id',
        as: 'propertyType'
    });
};

module.exports = PropertyType;