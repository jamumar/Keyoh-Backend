const { Sequelize } = require('sequelize');

// Standard SQL logger formatting
function readableLogger(sql) {
    const clean = sql.replace(/Executing \(default\): /i, '').trim();
    const match = clean.match(/^(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\s+[`"]?([\w-]+)[`"]?/i);
    if (match) {
        const op = match[1].toUpperCase();
        const table = match[2];
        console.log(`[db] ${op.padEnd(10)} ${table}`);
    }
}

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USERNAME,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: process.env.DB_DIALECT,
        logging: process.env.NODE_ENV === 'development' ? readableLogger : false,
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
    }
);

async function connectDB() {
    try {
        await sequelize.authenticate();
        console.log('[db] Database connected successfully.');
        try {
            await sequelize.query('ALTER TABLE users ADD COLUMN push_token VARCHAR(255) NULL;');
        } catch (colErr) {
            // Column already exists
        }
    } catch (error) {
        console.error('[db] Database connection failed:', error.message);
    }
}

module.exports = { sequelize, connectDB };
