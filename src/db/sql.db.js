const mysql = require('mysql2/promise');
require('dotenv').config();

const environment = process.env.NODE_ENV || 'development';
console.log(`📊 Running in ${environment} mode`);

// Build config
const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'campus_navigator',
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
};

// SSL only for production (Aiven requires it)
if (environment === 'production') {
    config.ssl = {
        rejectUnauthorized: false
    };
    console.log('🔒 SSL enabled');
}

console.log('📊 Host:', config.host);
console.log('📊 Port:', config.port);
console.log('📊 Database:', config.database);

// Create pool
let pool;
try {
    pool = mysql.createPool(config);
    console.log('✅ Pool created successfully');
} catch (error) {
    console.error('❌ Failed to create pool:', error.message);
    process.exit(1);
}

// Test connection
(async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL connected successfully!');
        connection.release();
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        console.error('💡 Check your database credentials');
    }
})();

module.exports = pool;