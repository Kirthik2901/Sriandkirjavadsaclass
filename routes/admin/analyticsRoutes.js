const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/admin/analyticsController');
const { protect, admin, superAdmin } = require('../../middlewares/authMiddleware');

router.use(protect);

router.get('/dashboard', admin, analyticsController.getDashboardStats);
router.get('/', superAdmin, analyticsController.getAnalytics);
router.delete('/cache', superAdmin, analyticsController.clearAnalyticsCache);

module.exports = router;