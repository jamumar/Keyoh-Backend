const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const Offers = sequelize.define('offers', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    buyer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    buyer_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    seller_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
    },
    counter_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    response_message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'countered', 'completed_sold'),
        defaultValue: 'pending',
    },
    accepted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    timestamps: true,
    tableName: 'offers',
});

Offers.associate = (models) => {
    Offers.belongsTo(models.Properties, {
        foreignKey: 'property_id',
        as: 'property',
        onDelete: 'CASCADE',
    });
    Offers.belongsTo(models.Users, {
        foreignKey: 'buyer_id',
        as: 'buyer',
        onDelete: 'CASCADE',
    });
    Offers.belongsTo(models.Users, {
        foreignKey: 'seller_id',
        as: 'seller',
        onDelete: 'CASCADE',
    });
};

module.exports = Offers;
