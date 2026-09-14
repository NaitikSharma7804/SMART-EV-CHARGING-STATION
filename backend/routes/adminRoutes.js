// backend/routes/adminRoutes.js
import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { syncRealStations } from '../services/ocmService.js';

const router = express.Router();

// Protect all routes: Must be logged in AND have 'ADMIN' role
router.use(authenticate, authorize(['ADMIN']));

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Users
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/status', adminController.updateUserStatus);

// Stations
router.post('/stations', adminController.addStation);

// Sync Real-World Stations from Open Charge Map API
router.post('/sync-stations', async (req, res) => {
    try {
        const { lat, lng, distance } = req.body;
        // Defaults to Pune coordinates if not specified
        const result = await syncRealStations(lat || 18.5204, lng || 73.8567, distance || 25);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Bookings
router.get('/bookings', adminController.getAllBookings);

export default router;