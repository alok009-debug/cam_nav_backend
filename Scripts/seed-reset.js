const mysql = require('mysql2/promise');
require('dotenv').config();

const resetAndSeed = async () => {
    console.log('🔄 Resetting and reseeding...');

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'campus_navigator',
        port: parseInt(process.env.DB_PORT) || 3306,
        ...(process.env.NODE_ENV === 'production' && {
            ssl: { rejectUnauthorized: false }
        })
    });

    try {
        // Delete nodes that are not location-based (node_id > 10 are test nodes)
        await pool.query('DELETE FROM campus_edges WHERE from_node_id > 10 OR to_node_id > 10');
        await pool.query('DELETE FROM campus_nodes WHERE node_id > 10');

        console.log('✅ Reset completed! Now seeding...');
        await require('./seed')();

    } catch (error) {
        console.error('❌ Reset failed:', error.message);
    } finally {
        await pool.end();
    }
};

resetAndSeed();