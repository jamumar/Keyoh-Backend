'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_billings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      revenue_cat_app_user_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      package_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      offering_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      entitlement_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      billing_period: {
        type: Sequelize.ENUM('monthly', 'annual'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'trialing', 'expired', 'cancelled', 'grace_period'),
        allowNull: false,
        defaultValue: 'active',
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      expire_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      will_renew: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      store: {
        type: Sequelize.ENUM('app_store', 'play_store', 'stripe', 'promotional', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown',
      },
      is_trial: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex('user_billings', ['user_id']);
    await queryInterface.addIndex('user_billings', ['revenue_cat_app_user_id']);
    await queryInterface.addIndex('user_billings', ['status']);
    await queryInterface.addIndex('user_billings', ['expire_date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_billings');
  },
};
