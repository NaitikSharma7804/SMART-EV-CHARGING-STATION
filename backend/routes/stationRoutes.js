// backend/routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');

// Public Routes for finding stations
router.get('/nearby', stationController.getNearbyStations);
router.get('/', stationController.getAllStations);
router.get('/:id', stationController.getStationById);

module.exports = router;