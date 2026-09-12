const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many requests, please try again after 15 minutes.' }
});

router.post('/register', authLimiter, authController.register);
router.post('/verify-otp', authLimiter, authController.verifyOtp);
router.post('/login', authLimiter, authController.login);
router.post('/google', authController.googleAuth);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

module.exports = router;