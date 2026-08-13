'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('properties', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      address: {
        type: Sequelize.STRING,
        allowNull: false
      },
      post_code: {
        type: Sequelize.STRING(12),
        allowNull: false
      },
      boost: {
        type: Sequelize.ENUM('PRIME', 'TRENDING', ""),
        allowNull: false,
        defaultValue: "",
      },
      verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      price: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      beds: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      baths: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      includes: {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      images: {
        type: Sequelize.JSON,
        allowNull: false
      },
      property_type_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'property-types',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tenure_type_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'tenure-types',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      agent_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      like_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      view_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.ENUM('available', 'sold'),
        defaultValue: 'available',
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('properties');
  }
};
