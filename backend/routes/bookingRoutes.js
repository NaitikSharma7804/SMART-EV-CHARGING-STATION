// backend/routes/bookingRoutes.js
import express from 'express';
import * as bookingController from '../controllers/bookingController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all booking routes
router.use(authenticate);

router.post('/', bookingController.createBooking);
router.post('/verify-payment', bookingController.verifyPayment);

// Change this from '/' to '/my-bookings'
router.get('/my-bookings', bookingController.getMyBookings);

export default router;