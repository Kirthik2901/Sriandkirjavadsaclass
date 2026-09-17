const { body, param } = require('express-validator');

exports.createOrder = [
  body('orderId').notEmpty().withMessage('Order ID is required').isMongoId().withMessage('Invalid Order ID format')
];

exports.verifyPayment = [
  body('orderId').notEmpty().withMessage('Order ID is required').isMongoId(),
  body('razorpay_order_id').notEmpty().withMessage('Razorpay Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay Signature is required')
];

exports.getStatus = [
  param('orderId').notEmpty().withMessage('Order ID is required').isMongoId()
];

exports.refundPayment = [
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('amount').optional().isNumeric().withMessage('Amount must be a number'),
  body('reason').optional().isString()
];
