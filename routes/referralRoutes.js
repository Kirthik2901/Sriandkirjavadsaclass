const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const { protect, authorize } = require('../middlewares/authMiddleware');


// ─── PUBLIC ROUTES (no auth required) ────────────────────────────────────────
router.post('/track-click', referralController.trackReferralClick);
router.get('/info/:code', referralController.getReferralInfo);


// ─── AUTHENTICATED ROUTES ─────────────────────────────────────────────────────
router.use(protect);

router.post('/generate-link', referralController.generateReferralLink);
router.post('/register-user', referralController.registerReferralUser);
router.post('/calculate-discount', referralController.calculateReferralDiscount);
router.get('/my-stats', referralController.getMyReferralStats);
router.get('/my-coupons', referralController.getMyCoupons);


// ─── NOTIFICATION ROUTES ──────────────────────────────────────────────────────
// IMPORTANT: read-all must come BEFORE :id/read to avoid Express matching
// "read-all" as the :id parameter
router.patch('/notifications/read-all', referralController.markAllNotificationsRead);
router.get('/notifications', referralController.getNotifications);
router.patch('/notifications/:id/read', referralController.markNotificationRead);


// ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────
router.get('/admin/all', authorize('super-admin', 'content-admin'), referralController.getAllReferrals);

module.exports = router;