// backend/controllers/userController.js
const pool = require('../config/db');

// 1. Get User Profile
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const [users] = await pool.query(
            `SELECT id, name, email, mobile, is_verified, created_at, status 
             FROM users WHERE id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.status(200).json({ success: true, profile: users[0] });
    } catch (error) {
        console.error('Get Profile Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

// 2. Update User Profile
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, mobile } = req.body;

        if (!name || !mobile) {
            return res.status(400).json({ success: false, message: 'Name and mobile are required.' });
        }

        // Check if the new mobile number belongs to another user
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE mobile = ? AND id != ?',
            [mobile.trim(), userId]
        );

        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Mobile number is already in use.' });
        }

        await pool.query(
            'UPDATE users SET name = ?, mobile = ? WHERE id = ?',
            [name.trim(), mobile.trim(), userId]
        );

        return res.status(200).json({ success: true, message: 'Profile updated successfully.' });
    } catch (error) {
        console.error('Update Profile Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};