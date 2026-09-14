// backend/routes/vehicleRoutes.js
import express from 'express';
import * as vehicleController from '../controllers/vehicleController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all vehicle routes
router.use(authenticate);

router.get('/', vehicleController.getVehicles);
router.post('/', vehicleController.addVehicle);
router.delete('/:id', vehicleController.deleteVehicle);

export default router;