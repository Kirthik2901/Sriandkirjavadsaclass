const express = require('express');
const router = express.Router();
const { protect, admin } = require('../../middlewares/authMiddleware');
const couponController = require('../../controllers/couponController');


router.post('/', protect, admin, couponController.createAdminCoupon);
router.get('/', protect, admin, couponController.getAllCoupons);
router.put('/:id', protect, admin, couponController.updateCoupon);
router.delete('/:id', protect, admin, couponController.deleteCoupon);

module.exports = router;
