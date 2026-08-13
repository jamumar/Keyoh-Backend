'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('property-types', [{
      name: 'Detached',
      status: 'active'
    }, {
      name: 'Semi-detached',
      status: 'active'
    }, {
      name: 'Terraced',
      status: 'active'
    }, {
      name: 'Flat',
      status: 'active'
    }, {
      name: 'Bungalow',
      status: 'active'
    }])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('property-types', null, {});
  }
};
