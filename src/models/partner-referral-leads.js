const { DataTypes } = require("sequelize");
const { sequelize } = require("../lib/db");

const PartnerReferralLeads = sequelize.define("partner_referral_leads", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    reference_code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    partner_type: {
        type: DataTypes.ENUM("mortgage", "conveyancing"),
        allowNull: false,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM("submitted", "partner_contacted", "converted", "cancelled"),
        defaultValue: "submitted",
    },
});

module.exports = PartnerReferralLeads;
