const { DataTypes } = require("sequelize");
const { sequelize } = require("../lib/db");

const ModerationLog = sequelize.define("moderation_log", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    actor: {
        type: DataTypes.STRING, // 'auto' | 'admin' | 'one_tap_email'
        allowNull: false,
    },
    action: {
        type: DataTypes.ENUM("auto_hide", "remove_warn", "remove_ban", "restore"),
        allowNull: false,
    },
    target_type: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    target_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    report_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, {
    tableName: 'moderation_log',
    freezeTableName: true,
});

module.exports = ModerationLog;
