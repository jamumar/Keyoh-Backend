require('dotenv').config();
const { sequelize } = require('./src/lib/db');
const { Users, PropertyType: PropertyTypes, TenureType: TenureTypes } = require('./src/models');
const bcrypt = require('bcrypt');

async function seedDatabase() {
  console.log('[seeder] Initializing database seeding...');
  try {
    await sequelize.sync();

    // 1. Seed Property Types
    const pTypes = [
      { name: 'House', status: 'active' },
      { name: 'Apartment', status: 'active' },
      { name: 'Detached', status: 'active' },
      { name: 'Semi-Detached', status: 'active' },
      { name: 'Terraced', status: 'active' },
      { name: 'Bungalow', status: 'active' },
    ];
    for (const pt of pTypes) {
      await PropertyTypes.findOrCreate({ where: { name: pt.name }, defaults: pt });
    }
    console.log('[seeder] Property types seeded.');

    // 2. Seed Tenure Types
    const tTypes = [
      { name: 'Freehold', status: 'active' },
      { name: 'Leasehold', status: 'active' },
      { name: 'Share of Freehold', status: 'active' },
    ];
    for (const tt of tTypes) {
      await TenureTypes.findOrCreate({ where: { name: tt.name }, defaults: tt });
    }
    console.log('[seeder] Tenure types seeded.');

    // 3. Seed Production Initial Accounts
    const hashedPassword = await bcrypt.hash('password123', 10);
    const initialUsers = [
      {
        agency_name: 'KEYOH HQ',
        name: 'Umar',
        email: 'umar@gmail.com',
        password: hashedPassword,
        role: 'seller',
        phone: '+447911123456',
        email_verified: true,
        phone_verified: true,
        stripe_identity_status: 'pass',
        stripe_identity_date: new Date(),
        is_verified_buyer: true,
        seller_ownership_declaration: true,
        seller_ownership_declaration_date: new Date(),
      },
      {
        agency_name: 'KEYOH Partner',
        name: 'Imran',
        email: 'imran@gmail.com',
        password: hashedPassword,
        role: 'agent',
        phone: '+447911123457',
        email_verified: true,
        phone_verified: true,
        stripe_identity_status: 'pass',
        stripe_identity_date: new Date(),
        is_verified_buyer: true,
      },
    ];

    for (const u of initialUsers) {
      await Users.findOrCreate({ where: { email: u.email }, defaults: u });
    }
    console.log('[seeder] Initial user accounts created.');

    console.log('[seeder] Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('[seeder] Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
