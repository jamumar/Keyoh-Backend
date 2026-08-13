'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint(
      'property_handovers',
      'property_handovers_ibfk_1'
    ).catch(async () => {
      const table = await queryInterface.describeTable('property_handovers');
      if (!table.property_id) return;

      const [constraints] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'property_handovers'
          AND COLUMN_NAME = 'property_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `);

      for (const row of constraints) {
        await queryInterface.removeConstraint('property_handovers', row.CONSTRAINT_NAME);
      }
    });

    const table = await queryInterface.describeTable('property_handovers');
    if (table.property_id) {
      try {
        await queryInterface.removeIndex('property_handovers', ['property_id']);
      } catch (error) {
        // Index may already be removed with the foreign key.
      }
      await queryInterface.removeColumn('property_handovers', 'property_id');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('property_handovers', 'property_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'properties',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('property_handovers', ['property_id']);
  },
};
