// backend/config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ev_charge_hub',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test connection on startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database:', process.env.DB_NAME || 'ev_charge_hub');
        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

module.exports = pool;