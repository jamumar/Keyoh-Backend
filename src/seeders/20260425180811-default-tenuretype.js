'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add seed commands here.
     *
     * Example:
     * await queryInterface.bulkInsert('People', [{
     *   name: 'John Doe',
     *   isBetaMember: false
     * }], {});
    */
    await queryInterface.bulkInsert('tenure-types', [{
      name: 'Freehold',
      status: 'active'
    }, {
      name: 'Leasehold',
      status: 'active'
    }, {
      name: 'Share of Freehold',
      status: 'active'
    }])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('tenure-types', null, {});
  }
};
