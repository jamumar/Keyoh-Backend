const { sequelize } = require("../lib/db");
const { DataTypes } = require("sequelize");

const Properties = sequelize.define("properties", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    address: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    post_code: {
        type: DataTypes.STRING(12),
        allowNull: false,
    },
    boost: {
        type: DataTypes.ENUM('PRIME', 'TRENDING', 'SEEN', ""),
        allowNull: false,
        defaultValue: '',
    },
    verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
    price: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    beds: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    baths: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    includes: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    images: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    videos: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
    },
    like_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    view_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    property_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'property-types',
            key: 'id'
        }
    },
    tenure_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'tenure-types',
            key: 'id'
        }
    },
    agent_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    status: {
        type: DataTypes.ENUM('available', 'under_offer', 'sold'),
        defaultValue: 'available',
        allowNull: false,
    },
    sold_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    hidden_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    moderation_status: {
        type: DataTypes.ENUM('clean', 'pending', 'removed', 'restored'),
        defaultValue: 'clean',
        allowNull: false,
    },
});

Properties.associate = function (models) {
    Properties.belongsTo(models.PropertyType, {
        foreignKey: 'property_type_id',
        as: 'propertyType'
    });
    Properties.belongsTo(models.TenureType, {
        foreignKey: 'tenure_type_id',
        as: 'tenureType'
    });
    Properties.belongsTo(models.Users, {
        foreignKey: 'agent_id',
        as: 'agentProperties'
    });
    Properties.hasMany(models.Saves, {
        foreignKey: 'property_id',
        as: 'propertyLike'
    });
    Properties.hasMany(models.PropertyViews, {
        foreignKey: 'property_id',
        as: 'propertyView'
    });
};


module.exports = Properties;
