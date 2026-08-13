'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('properties', 'post_code', {
      type: Sequelize.STRING(12),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('properties', 'post_code', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
