// backend/routes/reviewRoutes.js
import express from 'express';
import * as reviewController from '../controllers/reviewController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/station/:stationId', reviewController.getStationReviews);
router.post('/', authenticate, reviewController.addReview);

export default router;