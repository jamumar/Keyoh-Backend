'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('property_handovers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      property_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      seller_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      agent_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      agent_email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      agent_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'declined', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      referral_fee_pence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 25000,
      },
      channel_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      accepted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('property_handovers', ['property_id']);
    await queryInterface.addIndex('property_handovers', ['seller_id']);
    await queryInterface.addIndex('property_handovers', ['agent_email']);
    await queryInterface.addIndex('property_handovers', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('property_handovers');
  },
};
