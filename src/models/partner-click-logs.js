const { DataTypes } = require("sequelize");
const { sequelize } = require("../lib/db");

const PartnerClickLogs = sequelize.define("partner_click_logs", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    partner_type: {
        type: DataTypes.ENUM("mortgage", "conveyancing"),
        allowNull: false,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    ip_address: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    user_agent: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    clicked_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
});

module.exports = PartnerClickLogs;
