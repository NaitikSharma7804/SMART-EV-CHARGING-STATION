// backend/routes/notificationRoutes.js
import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', notificationController.getMyNotifications);
router.put('/:id/read', notificationController.markAsRead);

export default router;