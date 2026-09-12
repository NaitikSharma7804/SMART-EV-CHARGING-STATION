const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/authMiddleware');

// Public route to view reviews
router.get('/station/:stationId', reviewController.getStationReviews);

// Protected route to add a review
router.post('/', authenticate, reviewController.addReview);

module.exports = router;