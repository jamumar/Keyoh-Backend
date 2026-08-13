const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db')

const TenureType = sequelize.define('tenure-types', {
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

TenureType.associate = function (models) {
    TenureType.hasMany(models.Properties, {
        foreignKey: 'tenure_type_id',
        as: 'tenureType'
    });
};

module.exports = TenureType;