// backend/routes/placesRoutes.js
import express from 'express';
import * as placesController from '../controllers/placesController.js';

const router = express.Router();

router.get('/search', placesController.searchPlaces);
router.get('/autocomplete', placesController.autocompletePlaces);

export default router;