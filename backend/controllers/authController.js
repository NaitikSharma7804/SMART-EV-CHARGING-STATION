// backend/controllers/authController.js

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import pool from '../config/db.js';
import { generateToken } from '../utils/jwt.js';


// ============================================================
// 1. USER REGISTRATION
// POST /api/auth/register
// ============================================================

export const register = async (req, res) => {

    try {

        console.log('========================================');
        console.log('REGISTER REQUEST');
        console.log('Body:', req.body);
        console.log('========================================');


        /*
         * NEW DATABASE USES:
         *
         * name
         * email
         * phone
         * password
         *
         * Frontend sends:
         *
         * {
         *   name,
         *   email,
         *   phone,
         *   password,
         *   confirmPassword
         * }
         */

        const {
            name,
            email,
            phone,
            password,
            confirmPassword
        } = req.body;


        // --------------------------------------------------------
        // VALIDATION
        // --------------------------------------------------------

        if (
            !name ||
            !email ||
            !phone ||
            !password ||
            !confirmPassword
        ) {

            return res.status(400).json({
                success: false,
                message: 'All fields are required.'
            });

        }


        const cleanName =
            String(name).trim();

        const cleanEmail =
            String(email).trim().toLowerCase();

        const cleanPhone =
            String(phone).trim();


        if (cleanName.length < 2) {

            return res.status(400).json({
                success: false,
                message: 'Please enter a valid name.'
            });

        }


        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {

            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });

        }


        if (
            !/^[6-9][0-9]{9}$/.test(cleanPhone)
        ) {

            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit phone number.'
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                success: false,
                message: 'Password must contain at least 6 characters.'
            });

        }


        if (password !== confirmPassword) {

            return res.status(400).json({
                success: false,
                message: 'Passwords do not match.'
            });

        }


        // --------------------------------------------------------
        // CHECK EXISTING USER
        // --------------------------------------------------------

        const [existingUsers] =
            await pool.query(
                `
                SELECT id, email, phone
                FROM users
                WHERE email = ?
                   OR phone = ?
                LIMIT 1
                `,
                [
                    cleanEmail,
                    cleanPhone
                ]
            );


        if (existingUsers.length > 0) {

            const existing =
                existingUsers[0];


            if (
                existing.email &&
                existing.email.toLowerCase() === cleanEmail
            ) {

                return res.status(409).json({
                    success: false,
                    message: 'Email is already registered.'
                });

            }


            if (
                existing.phone &&
                existing.phone === cleanPhone
            ) {

                return res.status(409).json({
                    success: false,
                    message: 'Phone number is already registered.'
                });

            }


            return res.status(409).json({
                success: false,
                message: 'User is already registered.'
            });

        }


        // --------------------------------------------------------
        // HASH PASSWORD
        // --------------------------------------------------------

        const passwordHash =
            await bcrypt.hash(
                password,
                10
            );


        // --------------------------------------------------------
        // INSERT USER
        // --------------------------------------------------------

        const [result] =
            await pool.query(
                `
                INSERT INTO users
                (
                    name,
                    email,
                    password,
                    phone,
                    role,
                    is_verified
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    'user',
                    FALSE
                )
                `,
                [
                    cleanName,
                    cleanEmail,
                    passwordHash,
                    cleanPhone
                ]
            );


        const userId =
            result.insertId;


        // --------------------------------------------------------
        // GENERATE OTP
        // --------------------------------------------------------

        const otp =
            Math.floor(
                100000 +
                Math.random() * 900000
            ).toString();


        const expiresAt =
            new Date(
                Date.now() +
                10 * 60 * 1000
            );


        // Remove previous OTPs for this email

        await pool.query(
            `
            DELETE FROM otp_verifications
            WHERE identifier = ?
            `,
            [cleanEmail]
        );


        // Insert new OTP

        await pool.query(
            `
            INSERT INTO otp_verifications
            (
                identifier,
                otp_code,
                expires_at,
                attempts
            )
            VALUES
            (
                ?,
                ?,
                ?,
                0
            )
            `,
            [
                cleanEmail,
                otp,
                expiresAt
            ]
        );


        console.log('========================================');
        console.log('USER CREATED');
        console.log('User ID:', userId);
        console.log('Email:', cleanEmail);
        console.log('OTP:', otp);
        console.log('========================================');


        return res.status(201).json({

            success: true,

            message:
                'Registration successful. Please verify your account with the OTP.',

            userId: userId,

            demoOtp:
                process.env.NODE_ENV !== 'production'
                    ? otp
                    : undefined

        });


    } catch (error) {

        console.error(
            'REGISTRATION ERROR:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Registration failed.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};



// ============================================================
// 2. VERIFY OTP
// POST /api/auth/verify-otp
// ============================================================

export const verifyOtp = async (req, res) => {

    try {

        const {
            identifier,
            otp
        } = req.body;


        if (!identifier || !otp) {

            return res.status(400).json({

                success: false,

                message:
                    'Email and OTP are required.'

            });

        }


        const cleanIdentifier =
            String(identifier)
                .trim()
                .toLowerCase();


        const cleanOtp =
            String(otp).trim();


        if (!/^[0-9]{6}$/.test(cleanOtp)) {

            return res.status(400).json({

                success: false,

                message:
                    'OTP must contain 6 digits.'

            });

        }


        // --------------------------------------------------------
        // GET LATEST OTP
        // --------------------------------------------------------

        const [records] =
            await pool.query(
                `
                SELECT *
                FROM otp_verifications
                WHERE identifier = ?
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [cleanIdentifier]
            );


        if (records.length === 0) {

            return res.status(400).json({

                success: false,

                message:
                    'No OTP requested for this email.'

            });

        }


        const otpRecord =
            records[0];


        // --------------------------------------------------------
        // CHECK EXPIRY
        // --------------------------------------------------------

        if (
            new Date() >
            new Date(otpRecord.expires_at)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'OTP has expired. Please register again.'

            });

        }


        // --------------------------------------------------------
        // CHECK ATTEMPTS
        // --------------------------------------------------------

        if (
            Number(otpRecord.attempts || 0) >= 5
        ) {

            return res.status(429).json({

                success: false,

                message:
                    'Too many failed attempts. Please register again.'

            });

        }


        // --------------------------------------------------------
        // CHECK OTP
        // --------------------------------------------------------

        if (
            String(otpRecord.otp_code) !==
            cleanOtp
        ) {

            await pool.query(
                `
                UPDATE otp_verifications
                SET attempts = attempts + 1
                WHERE id = ?
                `,
                [otpRecord.id]
            );


            return res.status(400).json({

                success: false,

                message:
                    'Invalid OTP code.'

            });

        }


        // --------------------------------------------------------
        // MARK USER VERIFIED
        // --------------------------------------------------------

        const [updateResult] =
            await pool.query(
                `
                UPDATE users
                SET is_verified = TRUE
                WHERE email = ?
                `,
                [cleanIdentifier]
            );


        if (
            updateResult.affectedRows === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    'User account not found.'

            });

        }


        // --------------------------------------------------------
        // DELETE OTP
        // --------------------------------------------------------

        await pool.query(
            `
            DELETE FROM otp_verifications
            WHERE identifier = ?
            `,
            [cleanIdentifier]
        );


        console.log(
            'User verified:',
            cleanIdentifier
        );


        return res.status(200).json({

            success: true,

            message:
                'Account verified successfully. You can now login.'

        });


    } catch (error) {

        console.error(
            'OTP VERIFICATION ERROR:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'OTP verification failed.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};



// ============================================================
// 3. USER LOGIN
// POST /api/auth/login
// ============================================================

export const login = async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({

                success: false,

                message:
                    'Email and password are required.'

            });

        }


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();


        // --------------------------------------------------------
        // FIND USER
        // --------------------------------------------------------

        const [users] =
            await pool.query(
                `
                SELECT *
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );


        if (users.length === 0) {

            return res.status(401).json({

                success: false,

                message:
                    'Invalid email or password.'

            });

        }


        const user =
            users[0];


        // --------------------------------------------------------
        // CHECK PASSWORD
        // --------------------------------------------------------

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!passwordMatch) {

            return res.status(401).json({

                success: false,

                message:
                    'Invalid email or password.'

            });

        }


        // --------------------------------------------------------
        // CHECK VERIFICATION
        // --------------------------------------------------------

        if (!user.is_verified) {

            return res.status(403).json({

                success: false,

                message:
                    'Please verify your account with OTP before logging in.'

            });

        }


        // --------------------------------------------------------
        // TOKEN
        // --------------------------------------------------------

        const token =
            generateToken({

                id: user.id,

                email: user.email,

                role:
                    user.role || 'user'

            });


        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return res.status(200).json({

            success: true,

            message:
                'Login successful.',

            token: token,

            user: {

                id:
                    user.id,

                name:
                    user.name,

                email:
                    user.email,

                /*
                 * Keep "mobile" in response too
                 * so older frontend pages don't break.
                 */

                mobile:
                    user.phone,

                phone:
                    user.phone,

                role:
                    user.role || 'user',

                is_verified:
                    Boolean(user.is_verified)

            }

        });


    } catch (error) {

        console.error(
            'LOGIN ERROR:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Login failed.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};



// ============================================================
// 4. GOOGLE AUTH FALLBACK
// POST /api/auth/google
// ============================================================

export const googleAuth = async (req, res) => {

    try {

        const {
            email,
            name
        } = req.body;


        if (!email) {

            return res.status(400).json({

                success: false,

                message:
                    'Google account email is required.'

            });

        }


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();


        // --------------------------------------------------------
        // CHECK USER
        // --------------------------------------------------------

        const [existingUsers] =
            await pool.query(
                `
                SELECT *
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );


        let user;


        if (existingUsers.length > 0) {

            user =
                existingUsers[0];


            if (!user.is_verified) {

                await pool.query(
                    `
                    UPDATE users
                    SET is_verified = TRUE
                    WHERE id = ?
                    `,
                    [user.id]
                );

                user.is_verified = 1;
            }

        } else {

            // ----------------------------------------------------
            // CREATE GOOGLE USER
            // ----------------------------------------------------

            const randomPassword =
                crypto.randomBytes(24)
                    .toString('hex');


            const passwordHash =
                await bcrypt.hash(
                    randomPassword,
                    10
                );


            /*
             * Generate a unique phone placeholder.
             * Google accounts don't necessarily provide
             * a phone number.
             */

            const generatedPhone =
                `G${Date.now()}`.slice(0, 15);


            const [result] =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        name,
                        email,
                        password,
                        phone,
                        role,
                        is_verified
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        'user',
                        TRUE
                    )
                    `,
                    [
                        name || 'Google User',
                        cleanEmail,
                        passwordHash,
                        generatedPhone
                    ]
                );


            user = {

                id:
                    result.insertId,

                name:
                    name || 'Google User',

                email:
                    cleanEmail,

                phone:
                    generatedPhone,

                role:
                    'user',

                is_verified:
                    1

            };

        }


        // --------------------------------------------------------
        // TOKEN
        // --------------------------------------------------------

        const token =
            generateToken({

                id:
                    user.id,

                email:
                    user.email,

                role:
                    user.role || 'user'

            });


        return res.status(200).json({

            success: true,

            message:
                'Google authentication successful.',

            token: token,

            user: {

                id:
                    user.id,

                name:
                    user.name,

                email:
                    user.email,

                mobile:
                    user.phone,

                phone:
                    user.phone,

                role:
                    user.role || 'user'

            }

        });


    } catch (error) {

        console.error(
            'GOOGLE AUTH ERROR:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Google authentication failed.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};



// ============================================================
// 5. FORGOT PASSWORD
// POST /api/auth/forgot-password
// ============================================================

export const forgotPassword = async (req, res) => {

    try {

        const {
            email
        } = req.body;


        if (!email) {

            return res.status(400).json({

                success: false,

                message:
                    'Email is required.'

            });

        }


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();


        const [users] =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );


        if (users.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    'User not found with this email.'

            });

        }


        const user =
            users[0];


        const resetToken =
            crypto.randomBytes(32)
                .toString('hex');


        const expiresAt =
            new Date(
                Date.now() +
                15 * 60 * 1000
            );


        await pool.query(
            `
            DELETE FROM password_resets
            WHERE user_id = ?
            `,
            [user.id]
        );


        await pool.query(
            `
            INSERT INTO password_resets
            (
                user_id,
                reset_token,
                expires_at
            )
            VALUES
            (
                ?,
                ?,
                ?
            )
            `,
            [
                user.id,
                resetToken,
                expiresAt
            ]
        );


        return res.status(200).json({

            success: true,

            message:
                'Password reset token generated.',

            resetToken:
                process.env.NODE_ENV !== 'production'
                    ? resetToken
                    : undefined

        });


    } catch (error) {

        console.error(
            'FORGOT PASSWORD ERROR:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Error processing password reset.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};



// ============================================================
// 6. RESET PASSWORD
// POST /api/auth/reset-password
// ============================================================

export const resetPassword = async (req, res) => {

    try {

        const {
            token,
            newPassword
        } = req.body;


        if (!token || !newPassword) {

            return res.status(400).json({

                success: false,

                message:
                    'Reset token and new password are required.'

            });

        }


        if (newPassword.length < 6) {

            return res.status(400).json({

                success: false,

                message:
                    'Password must contain at least 6 characters.'

            });

        }


        const [records] =
            await pool.query(
                `
                SELECT *
                FROM password_resets
                WHERE reset_token = ?
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [token]
            );


        if (records.length === 0) {

            return res.status(400).json({

                success: false,

                message:
                    'Invalid or expired password reset token.'

            });

        }


        const resetRecord =
            records[0];


        const passwordHash =
            await bcrypt.hash(
                newPassword,
                10
            );


        await pool.query(
            `
            UPDATE users
            SET password = ?
            WHERE id = ?
            `,
            [
                passwordHash,
                resetRecord.user_id
            ]
        );


        await pool.query(
            `
            DELETE FROM password_resets
            WHERE user_id = ?
            `,
            [resetRecord.user_id]
        );


        return res.status(200).json({

            success: true,

            message:
                'Password updated successfully. Please login with your new password.'

        });


    } catch (error) {

        console.error(
            'RESET PASSWORD ERROR:',
            error
        );


        return res.status(500).json({

            success: false,

            message:
                'Error updating password.',

            error:
                process.env.NODE_ENV !== 'production'
                    ? error.message
                    : undefined

        });

    }

};