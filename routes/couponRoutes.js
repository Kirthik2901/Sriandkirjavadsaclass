const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const couponController = require('../controllers/couponController');


router.post('/validate', protect, couponController.validateCoupon);
router.get('/my-coupons', protect, couponController.getUserCoupons);

module.exports = router;