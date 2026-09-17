const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, admin } = require('../middlewares/authMiddleware');
const fileUpload = require('../utils/fileUpload');

const upload = fileUpload.getMulterConfig();



router.get('/pincode/:pincode', orderController.lookupPincode);


router.post('/razorpay/create', protect, orderController.createRazorpayOrder);
router.post('/razorpay/verify', protect, orderController.verifyPayment);



router.post('/', protect, orderController.createOrder);


router.get('/', protect, orderController.getUserOrders);


router.post('/:orderId/return', protect, upload.fields([{ name: 'videos', maxCount: 1 }]), orderController.requestReturn);


router.post('/:orderId/return/upi', protect, orderController.submitReturnUpi);



router.get('/:id', protect, orderController.getOrderById);


router.get('/:id/invoice', protect, orderController.downloadInvoice);



router.get('/admin/all', protect, admin, orderController.getAllOrders);


router.put('/:id/status', protect, admin, orderController.updateOrderStatus);


router.put('/:id/return', protect, admin, orderController.handleReturnRequest);

module.exports = router;