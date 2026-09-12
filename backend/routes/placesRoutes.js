// backend/routes/placesRoutes.js
const express = require('express');
const router = express.Router();
const placesController = require('../controllers/placesController');

// Public route to discover amenities while charging
router.get('/nearby', placesController.getNearbyPlacesForStation);

module.exports = router;