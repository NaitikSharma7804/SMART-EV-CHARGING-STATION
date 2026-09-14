// backend/routes/stationRoutes.js
import express from 'express';
import * as stationController from '../controllers/stationController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', stationController.getAllStations);
router.get('/nearby', stationController.getNearbyStations);
router.get('/:id', stationController.getStationById);

export default router;