'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('agent_stats', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      agent_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      listing_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_views: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_enquiries: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      new_enquiries: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      avg_response_minutes: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      avg_review_rating: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      completion_rate: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      keyoh_score: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 70,
      },
      calculated_at: {
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('agent_stats');
  },
};
