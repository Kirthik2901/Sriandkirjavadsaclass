const express = require('express');
const router = express.Router();
const exportController = require('../../controllers/admin/exportController');
const { protect, admin } = require('../../middlewares/authMiddleware');

router.use(protect, admin);

router.get('/orders', exportController.exportOrders);
router.get('/returns', exportController.exportReturns);

module.exports = router;
