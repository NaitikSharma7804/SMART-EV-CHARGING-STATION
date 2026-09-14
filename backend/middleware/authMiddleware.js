// backend/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const authenticate = async (req, res, next) => {
    try {
        let token;
        
        // Extract token from header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authorized, no token provided.' });
        }

        // Verify token signature
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch fresh user data using the NEW 'role' column!
        const [users] = await pool.query(
            'SELECT id, name, email, role, status FROM users WHERE id = ?', 
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }

        if (users[0].status === 'blocked') {
            return res.status(403).json({ success: false, message: 'Account is blocked.' });
        }

        // Attach user to request object
        req.user = users[0];
        next();
        
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        return res.status(401).json({ success: false, message: 'Not authorized, token verification failed.' });
    }
};

export const authorize = (roles = []) => {
    return (req, res, next) => {
        // Now req.user.role correctly reads 'ADMIN' directly from our new column
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges.' });
        }
        next();
    };
};