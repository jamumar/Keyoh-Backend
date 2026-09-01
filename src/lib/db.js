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
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? readableLogger : false,
        benchmark: process.env.NODE_ENV === 'development',
        pool: {
            max: 25,          // Increased for concurrent request handling
            min: 2,           // Keep warm connections ready
            acquire: 30000,
            idle: 10000,
        },
    }
);

async function connectDB() {
    try {
        await sequelize.authenticate();
        console.log('[db] Database connected successfully.');
        
        // Auto-add missing columns & high-performance query indexes
        const migrations = [
            'ALTER TABLE users ADD COLUMN push_token VARCHAR(255) NULL;',
            'ALTER TABLE users ADD COLUMN avatar TEXT NULL;',
            'ALTER TABLE users ADD COLUMN apple_id VARCHAR(255) NULL;',
            // Critical Performance Indexes
            'CREATE INDEX idx_properties_agent ON properties(agent_id);',
            'CREATE INDEX idx_properties_status ON properties(status);',
            'CREATE INDEX idx_properties_boost ON properties(boost);',
            'CREATE INDEX idx_offers_buyer ON offers(buyer_id);',
            'CREATE INDEX idx_offers_seller ON offers(seller_id);',
            'CREATE INDEX idx_offers_property ON offers(property_id);',
            'CREATE INDEX idx_conversations_buyer ON conversations(buyer_id);',
            'CREATE INDEX idx_conversations_seller ON conversations(seller_id);',
            'CREATE INDEX idx_messages_conv ON messages(conversation_id);',
            'CREATE INDEX idx_users_role ON users(role);',
        ];
        
        for (const sql of migrations) {
            try { 
                await sequelize.query(sql); 
            } catch (e) { 
                /* Column/Index already exists — safe to ignore */ 
            }
        }
    } catch (error) {
        console.error('[db] Database connection failed:', error.message);
    }
}

module.exports = { sequelize, connectDB };
