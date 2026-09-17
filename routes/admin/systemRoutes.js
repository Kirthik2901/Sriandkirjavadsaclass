const express = require('express');
const SystemController = require('../../controllers/admin/systemController');
const { protect, superAdmin } = require('../../middlewares/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/settings', superAdmin, SystemController.getSystemSettings);
router.get('/public-settings', superAdmin, SystemController.getPublicSettings);
router.put('/settings/:category/:key', superAdmin, SystemController.updateSystemSetting);
router.post('/cache/clear', superAdmin, SystemController.clearCache);

module.exports = router;