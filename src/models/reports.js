const { DataTypes } = require("sequelize");
const { sequelize } = require("../lib/db");

const Reports = sequelize.define("reports", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    reporter_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    target_type: {
        type: DataTypes.ENUM("photo", "video", "message", "user", "property"),
        allowNull: false,
    },
    target_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM("pending", "actioned", "restored"),
        defaultValue: "pending",
    },
});

Reports.associate = function (models) {
    Reports.belongsTo(models.Users, {
        foreignKey: "reporter_id",
        as: "reporter",
    });
    Reports.belongsTo(models.Properties, {
        foreignKey: "property_id",
        as: "property",
    });
};

module.exports = Reports;
