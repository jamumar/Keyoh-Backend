'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('properties', 'boost', {
      type: Sequelize.ENUM('PRIME', 'TRENDING', 'SEEN', ''),
      allowNull: false,
      defaultValue: '',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('properties', 'boost', {
      type: Sequelize.ENUM('PRIME', 'TRENDING', ''),
      allowNull: false,
      defaultValue: '',
    });
  },
};
