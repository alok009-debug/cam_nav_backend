const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('📊 Database Config:');
console.log('Host:', process.env.DB_HOST);
console.log('Port:', process.env.DB_PORT);  // Should show 3036
console.log('User:', process.env.DB_USER);
console.log('Database:', process.env.DB_NAME);

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,  // ✅ Use DB_PORT, not PORT!
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
});

(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL connected successfully!');
        connection.release();
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        console.error('Please check:');
        console.error('1. DB_HOST:', process.env.DB_HOST);
        console.error('2. DB_PORT:', process.env.DB_PORT);
        console.error('3. DB_USER:', process.env.DB_USER);
        console.error('4. DB_NAME:', process.env.DB_NAME);
    }
})();

module.exports = pool;