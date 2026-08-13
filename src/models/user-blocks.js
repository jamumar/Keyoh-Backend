const { DataTypes } = require("sequelize");
const { sequelize } = require("../lib/db");

const UserBlocks = sequelize.define("user_blocks", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    blocker_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    blocked_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
});

module.exports = UserBlocks;
