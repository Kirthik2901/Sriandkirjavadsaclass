const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const paymentValidation = require('./payment.validation');
const { protect } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');
const expressServer = require('express');

// Specific Rate Limits
const createOrderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many order requests from this IP, please try again after a minute'
});

const verifyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many verify requests from this IP, please try again after a minute'
});

// Create Order (Requires Auth)
router.post(
  '/create-order',
  protect,
  createOrderLimiter,
  paymentValidation.createOrder,
  paymentController.createOrder
);

// Verify Payment (Requires Auth)
router.post(
  '/verify',
  protect,
  verifyLimiter,
  paymentValidation.verifyPayment,
  paymentController.verifyPayment
);

// Get Payment Status (Requires Auth)
router.get(
  '/status/:orderId',
  protect,
  paymentValidation.getStatus,
  paymentController.getStatus
);

// Refund Payment (Requires Admin Auth - placeholder)
router.post(
  '/refund',
  protect,
  // admin middleware could go here
  paymentValidation.refundPayment,
  paymentController.refundPayment
);

// Webhook (No Auth, No Rate Limit - uses Razorpay Signature Verification)
// Note: We need raw body for signature verification, so we use express.raw
router.post(
  '/webhook',
  expressServer.raw({ type: 'application/json' }),
  paymentController.handleWebhook
);

module.exports = router;
