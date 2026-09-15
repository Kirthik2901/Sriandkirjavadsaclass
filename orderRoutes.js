const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, admin } = require('../middlewares/authMiddleware');



router.get('/pincode/:pincode', orderController.lookupPincode);


router.post('/razorpay/create', protect, orderController.createRazorpayOrder);
router.post('/razorpay/verify', protect, orderController.verifyPayment);



router.post('/', protect, orderController.createOrder);


router.get('/', protect, orderController.getUserOrders);


router.get('/:id', protect, orderController.getOrderById);


router.get('/:id/invoice', protect, orderController.downloadInvoice);



router.get('/admin/all', protect, admin, orderController.getAllOrders);


router.put('/:id/status', protect, admin, orderController.updateOrderStatus);

module.exports = router;