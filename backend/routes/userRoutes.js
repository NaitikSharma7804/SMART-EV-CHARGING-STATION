// backend/routes/userRoutes.js
import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all user routes
router.use(authenticate);

// Profile routes
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);

export default router;