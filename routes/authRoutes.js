const express = require('express');
const {
  registerUser,
  verifyOTP,
  loginUser,
  resendOTP,
  getMe,
  forgotPassword,
  resetPassword,
  ping
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const {
  validateRegister,
  validateLogin,
  validateOTP,
  validateResetPassword
} = require('../middlewares/validation');
const { handleValidation } = require('../middlewares/handleValidation');

const router = express.Router();

router.post('/register', validateRegister, handleValidation, registerUser);
router.post('/verify-otp', validateOTP, handleValidation, verifyOTP);
router.post('/login', validateLogin, handleValidation, loginUser);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', validateResetPassword, handleValidation, resetPassword);
router.get('/me', protect, getMe);
router.post('/ping', protect, ping);

module.exports = router;