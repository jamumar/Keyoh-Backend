const { DataTypes } = require('sequelize');
const { sequelize } = require('../lib/db');

const Messages = sequelize.define('messages', {
    id: {
        type: DataTypes.STRING(150),
        primaryKey: true,
        allowNull: false,
    },
    conversation_id: {
        type: DataTypes.STRING(150),
        allowNull: false,
    },
    sender_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    sender_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    time: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
}, {
    timestamps: true,
    tableName: 'messages',
});

Messages.associate = (models) => {
    Messages.belongsTo(models.Conversations, {
        foreignKey: 'conversation_id',
        as: 'conversation',
        onDelete: 'CASCADE',
    });
};

module.exports = Messages;
