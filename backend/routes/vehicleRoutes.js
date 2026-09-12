const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { authenticate } = require('../middleware/authMiddleware');

// Protect all vehicle routes
router.use(authenticate);

router.get('/', vehicleController.getVehicles);
router.post('/', vehicleController.addVehicle);
router.put('/:id', vehicleController.updateVehicle);
router.delete('/:id', vehicleController.deleteVehicle);
router.patch('/:id/default', vehicleController.setDefaultVehicle);

module.exports = router;