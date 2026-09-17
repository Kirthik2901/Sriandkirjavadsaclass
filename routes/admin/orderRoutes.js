const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/orderController');
const { protect, admin, superAdmin } = require('../../middlewares/authMiddleware');

router.get('/', protect, admin, OrderController.getAllOrders);
router.get('/:id', protect, admin, OrderController.getOrderById);
router.put('/:id/status', protect, superAdmin, OrderController.updateOrderStatus);
router.put('/:id/return', protect, superAdmin, OrderController.handleReturnRequest);

module.exports = router;