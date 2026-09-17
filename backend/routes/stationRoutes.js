import express from 'express';

import {
    getStations,
    getStationById,
    getStationAvailability
} from '../controllers/stationController.js';

import authenticate from '../middleware/authMiddleware.js';

const router = express.Router();


// GET /api/stations
router.get(
    '/',
    getStations
);


// GET /api/stations/:id
router.get(
    '/:id',
    getStationById
);


// GET /api/stations/:id/availability
router.get(
    '/:id/availability',
    getStationAvailability
);

export default router;