// backend/controllers/userController.js
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';

export const getProfile = async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, name, email, mobile, role, status, created_at FROM users WHERE id = ?', 
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.status(200).json({ success: true, data: users[0] });
    } catch (error) {
        console.error('Get Profile Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { name, mobile } = req.body;

        await pool.query(
            'UPDATE users SET name = ?, mobile = ? WHERE id = ?', 
            [name, mobile, req.user.id]
        );

        return res.status(200).json({ success: true, message: 'Profile updated successfully.' });
    } catch (error) {
        console.error('Update Profile Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update profile.' });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Incorrect current password.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);

        return res.status(200).json({ success: true, message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change Password Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to change password.' });
    }
};