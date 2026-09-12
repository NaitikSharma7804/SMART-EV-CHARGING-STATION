// backend/routes/bookingRoutes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/authMiddleware');

// Protect all booking routes
router.use(authenticate);

router.post('/', bookingController.createBooking);
router.post('/verify-payment', bookingController.verifyPayment);
router.get('/my-bookings', bookingController.getMyBookings);

module.exports = router;