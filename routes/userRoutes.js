const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const userController = require('../controllers/userController');


router.get('/profile', protect, userController.getUserProfile);
router.put('/profile', protect, userController.updateUserProfile);


router.get('/addresses', protect, userController.getUserAddresses);
router.post('/addresses', protect, userController.saveUserAddress);
router.put('/addresses/:addressId', protect, userController.updateUserAddress);
router.delete('/addresses/:addressId', protect, userController.deleteUserAddress);
router.put('/addresses/:addressId/default', protect, userController.setDefaultAddress);


router.post('/request-phone-otp', protect, userController.requestPhoneChangeOTP);
router.post('/verify-phone-otp', protect, userController.verifyAndUpdatePhone);

module.exports = router;