const pool = require('../config/db');

exports.sendNotification = async (userId, title, message, type = 'system') => {
    try {
        await pool.query(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [userId, title, message, type]
        );
        // If you want live in-app notifications, you can also emit an event here via Socket.IO
    } catch (error) {
        console.error('Notification Service Error:', error);
    }
};