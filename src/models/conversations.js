const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const Conversations = sequelize.define('conversations', {
    id: {
        type: DataTypes.STRING(150),
        primaryKey: true,
        allowNull: false,
    },
    home_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    home_address: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    home_price: {
        type: DataTypes.STRING(50),
        allowNull: true,
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
    seller_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    last_sender_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    last_message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    last_message_time: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    unread: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    read_by: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
    },
}, {
    timestamps: true,
    tableName: 'conversations',
});

Conversations.associate = (models) => {
    Conversations.hasMany(models.Messages, {
        foreignKey: 'conversation_id',
        as: 'messages',
        onDelete: 'CASCADE',
    });
};

module.exports = Conversations;
