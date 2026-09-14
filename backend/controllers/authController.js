// backend/controllers/authController.js
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../config/db.js';
import { generateToken } from '../utils/jwt.js';

// 1. User Registration
export const register = async (req, res) => {
    try {
        const { name, email, mobile, password, confirmPassword } = req.body;

        if (!name || !email || !mobile || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        // Check if user already exists
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR mobile = ?',
            [email.toLowerCase(), mobile]
        );

        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Email or mobile number already registered.' });
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert User (Relying on the database defaults for role)
        const [result] = await pool.query(
            `INSERT INTO users (name, email, mobile, password_hash, is_verified, status)
             VALUES (?, ?, ?, ?, FALSE, 'active')`,
            [name.trim(), email.toLowerCase().trim(), mobile.trim(), passwordHash]
        );

        // Generate 6-digit OTP for verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins expiry

        await pool.query(
            'INSERT INTO otp_verifications (identifier, otp_code, expires_at) VALUES (?, ?, ?)',
            [email.toLowerCase().trim(), otp, expiresAt]
        );

        return res.status(201).json({
            success: true,
            message: 'Registration successful. Please verify your account with the OTP sent.',
            userId: result.insertId,
            demoOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
    }
};

// 2. Verify OTP
export const verifyOtp = async (req, res) => {
    try {
        const { identifier, otp } = req.body;

        if (!identifier || !otp) {
            return res.status(400).json({ success: false, message: 'Email/Mobile and OTP code are required.' });
        }

        const [records] = await pool.query(
            `SELECT * FROM otp_verifications 
             WHERE identifier = ? 
             ORDER BY created_at DESC LIMIT 1`,
            [identifier.toLowerCase().trim()]
        );

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'No OTP requested for this identifier.' });
        }

        const otpRecord = records[0];

        if (new Date() > new Date(otpRecord.expires_at)) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        if (otpRecord.attempts >= 5) {
            return res.status(429).json({ success: false, message: 'Too many failed attempts. Request a new OTP.' });
        }

        if (otpRecord.otp_code !== otp.trim()) {
            await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?', [otpRecord.id]);
            return res.status(400).json({ success: false, message: 'Invalid OTP code.' });
        }

        // Mark user as verified
        await pool.query('UPDATE users SET is_verified = TRUE WHERE email = ? OR mobile = ?', [identifier, identifier]);
        await pool.query('DELETE FROM otp_verifications WHERE identifier = ?', [identifier]);

        return res.status(200).json({ success: true, message: 'Account verified successfully. You can now login.' });
    } catch (error) {
        console.error('OTP Verification Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

// 3. User Login
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        // Changed to read directly from the users table and the new `role` enum column
        const [users] = await pool.query(
            `SELECT * FROM users WHERE email = ?`,
            [email.toLowerCase().trim()]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const user = users[0];

        if (user.status === 'blocked') {
            return res.status(403).json({ success: false, message: 'Account blocked. Contact administrator.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const token = generateToken({
            id: user.id,
            email: user.email,
            role: user.role || 'USER'
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful.',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                role: user.role || 'USER', // Now correctly outputs 'ADMIN'
                is_verified: !!user.is_verified
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
};

// 4. Google OAuth Fallback / Handler
export const googleAuth = async (req, res) => {
    try {
        const { googleToken, email, name, googleId } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Google account email is required.' });
        }

        const [existing] = await pool.query(
            `SELECT * FROM users WHERE email = ?`,
            [email.toLowerCase()]
        );

        let user;
        if (existing.length > 0) {
            user = existing[0];
            if (!user.google_id && googleId) {
                await pool.query('UPDATE users SET google_id = ?, is_verified = TRUE WHERE id = ?', [googleId, user.id]);
            }
        } else {
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);

            const [result] = await pool.query(
                `INSERT INTO users (name, email, mobile, password_hash, role, google_id, is_verified, status)
                 VALUES (?, ?, ?, ?, 'USER', ?, TRUE, 'active')`,
                [name || 'Google User', email.toLowerCase(), `G-${Date.now().toString().slice(-8)}`, passwordHash, googleId || 'google_auth']
            );

            user = { id: result.insertId, name, email, role: 'USER', is_verified: 1 };
        }

        const token = generateToken({ id: user.id, email: user.email, role: user.role || 'USER' });

        return res.status(200).json({
            success: true,
            message: 'Google authentication successful.',
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role || 'USER' }
        });
    } catch (error) {
        console.error('Google Auth Error:', error);
        return res.status(500).json({ success: false, message: 'Google sign-in processing failed.' });
    }
};

// 5. Forgot Password
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found with this email.' });
        }

        const user = users[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await pool.query(
            'INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)',
            [user.id, resetToken, expiresAt]
        );

        return res.status(200).json({
            success: true,
            message: 'Password reset link/token generated.',
            resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error processing password reset.' });
    }
};

// 6. Reset Password
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        const [records] = await pool.query(
            'SELECT * FROM password_resets WHERE reset_token = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [token]
        );

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
        }

        const resetRecord = records[0];
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRecord.user_id]);
        await pool.query('DELETE FROM password_resets WHERE user_id = ?', [resetRecord.user_id]);

        return res.status(200).json({ success: true, message: 'Password updated successfully. Please login with your new password.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating password.' });
    }
};