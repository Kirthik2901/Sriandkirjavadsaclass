const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/orderController');
const { protect, admin } = require('../middlewares/authMiddleware');


router.use(protect);
router.use(admin);

router.get('/', OrderController.getAllOrders);
router.put('/:id/status', OrderController.updateOrderStatus);
router.put('/:id/return', OrderController.handleReturnRequest);

module.exports = router;