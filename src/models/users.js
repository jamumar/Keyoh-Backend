const { DataTypes } = require("sequelize");
const { sequelize } = require("../lib/db");

const Users = sequelize.define("users", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    agency_name: {
        type: DataTypes.STRING,
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
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM("user", "seller", "agent", "admin"),
        defaultValue: "user",
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    email_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    phone_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    stripe_identity_status: {
        type: DataTypes.ENUM('none', 'pending', 'pass', 'fail'),
        defaultValue: 'none',
    },
    stripe_identity_date: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    stripe_identity_session_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    buyer_position: {
        type: DataTypes.ENUM('none', 'cash_buyer', 'mortgage_in_principle', 'mortgage_not_arranged'),
        defaultValue: 'none',
    },
    is_verified_buyer: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    seller_ownership_declaration: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    seller_ownership_declaration_date: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    banned_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    ban_reason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    buyer_type: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    timeline: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    preferred_beds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 2,
    },
    max_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
    },
    push_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
});

Users.associate = function (models) {
    Users.hasMany(models.Properties, {
        foreignKey: 'agent_id',
        as: 'agentProperties'
    });
    Users.hasMany(models.PropertyViews, {
        foreignKey: 'user_id',
        as: 'userView'
    });
    Users.hasMany(models.Saves, {
        foreignKey: 'user_id',
        as: 'savedProperty'
    });
    Users.hasOne(models.AgentStats, {
        foreignKey: 'agent_id',
        as: 'agentStats',
    });
    Users.hasMany(models.UserBillings, {
        foreignKey: 'user_id',
        as: 'billings',
    });
};

module.exports = Users;