'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add claim_type column
    await queryInterface.addColumn('trial_device_claims', 'claim_type', {
      type: Sequelize.ENUM('agent', 'seller'),
      allowNull: false,
      defaultValue: 'agent',
    });

    // 2. Remove old unique index on device_hash alone
    try {
      await queryInterface.removeIndex('trial_device_claims', 'trial_device_claims_device_hash');
    } catch (e) {
      // Index name may differ; try alternate naming conventions
      try {
        await queryInterface.removeIndex('trial_device_claims', 'device_hash');
      } catch (e2) {
        console.warn('[migration] Could not drop old unique index on device_hash, it may not exist or has a different name:', e2.message);
      }
    }

    // Also remove the unique constraint added by Sequelize model definition
    try {
      await queryInterface.removeConstraint('trial_device_claims', 'trial_device_claims_device_hash_unique');
    } catch (e) {
      // May not exist under this name
    }

    // 3. Add composite unique index on (device_hash, claim_type)
    await queryInterface.addIndex('trial_device_claims', ['device_hash', 'claim_type'], {
      unique: true,
      name: 'trial_device_claims_device_hash_claim_type_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove composite unique index
    await queryInterface.removeIndex('trial_device_claims', 'trial_device_claims_device_hash_claim_type_unique');

    // 2. Restore unique index on device_hash alone
    await queryInterface.addIndex('trial_device_claims', ['device_hash'], {
      unique: true,
      name: 'trial_device_claims_device_hash',
    });

    // 3. Remove claim_type column
    await queryInterface.removeColumn('trial_device_claims', 'claim_type');

    // 4. Remove the ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_trial_device_claims_claim_type";');
  },
};
