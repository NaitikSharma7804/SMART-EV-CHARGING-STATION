// backend/controllers/notificationController.js
import pool from '../config/db.js';

// 1. Get user notifications
export const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );

        const unreadCount = notifications.filter(n => !n.is_read).length;

        return res.status(200).json({ success: true, count: notifications.length, unreadCount, data: notifications });
    } catch (error) {
        console.error('Get Notifications Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
};

// 2. Mark notification as read
export const markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );

        return res.status(200).json({ success: true, message: 'Notification marked as read.' });
    } catch (error) {
        console.error('Mark Notification Read Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update notification.' });
    }
};