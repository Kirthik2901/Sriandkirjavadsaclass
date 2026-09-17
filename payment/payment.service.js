const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Order = require('../models/order');
const Payment = require('../models/payment');
const Product = require('../models/product');
const logger = require('../utils/logger');
const razorpayIdempotent = require('../utils/razorpayIdempotent');
const mongoose = require('mongoose');

// Initialize Razorpay conditionally so it doesn't crash if env vars are missing at startup
let razorpayInstance = null;
const getRazorpay = () => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpayInstance;
};

// Generate Invoice Number
const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
};

exports.createOrder = async (userId, orderId) => {
  try {
    const order = await Order.findOne({ _id: orderId, user: userId });
    
    if (!order) {
      throw new Error('Order not found or does not belong to user');
    }

    if (!['pending', 'payment_initiated'].includes(order.paymentStatus)) {
      throw new Error(`Cannot initiate payment for order in status: ${order.paymentStatus}`);
    }

    // Prevent double orders: If there is an existing razorpay order ID and it was created recently (< 15 mins), reuse it
    if (order.razorpayOrderId && order.paymentStatus === 'payment_initiated') {
      const timeSinceInit = Date.now() - new Date(order.updatedAt).getTime();
      if (timeSinceInit < 15 * 60 * 1000) {
        logger.info(`Reusing existing Razorpay order ${order.razorpayOrderId} for order ${order._id}`);
        return {
          order_id: order.razorpayOrderId,
          amount: Math.round(order.totalAmount * 100),
          currency: 'INR'
        };
      }
    }

    // Backend calculation is trusted. Use order.totalAmount
    // Amount must be in integer paise
    const amountInPaise = Math.round(order.totalAmount * 100);

    const idempotencyKey = uuidv4();
    const rzpOrder = await razorpayIdempotent.createOrder({
      amount: amountInPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      payment_capture: 1 // Auto capture
    }, idempotencyKey);

    // Update order with razorpay ID
    order.razorpayOrderId = rzpOrder.id;
    order.paymentStatus = 'payment_initiated';
    await order.save();

    // Inventory Lock: In a real scenario, we might decrement stock here and use a Cron/TTL index to release it.
    // For now, we rely on the 30-min expiry Cron job (to be added) to release stock if not paid.

    // Create Payment record
    await Payment.create({
      orderId: order._id,
      userId: userId,
      razorpayOrderId: rzpOrder.id,
      idempotencyKey,
      receipt: order.orderNumber,
      amount: order.totalAmount,
      currency: 'INR',
      status: 'created'
    });

    logger.info(`Razorpay order created: ${rzpOrder.id} for Order: ${order._id}`);

    return {
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      receipt: rzpOrder.receipt
    };

  } catch (error) {
    logger.error('Error in createOrder service:', error);
    throw error;
  }
};

exports.verifyPayment = async (userId, orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({ _id: orderId, user: userId }).session(session);
    if (!order) throw new Error('Order not found');

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id, orderId: order._id }).session(session);
    if (!payment) throw new Error('Payment record not found');

    // Idempotency: If already paid, return success immediately to prevent double processing
    if (order.paymentStatus === 'paid' && payment.status === 'captured') {
      logger.info(`Idempotency check: Order ${order._id} already marked as paid.`);
      await session.abortTransaction();
      session.endSession();
      return { success: true, message: 'Payment already verified' };
    }

    if (order.razorpayOrderId !== razorpay_order_id) {
      throw new Error('Order ID mismatch');
    }

    // Verify Signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(razorpay_signature)
    );

    if (!isSignatureValid) {
      payment.status = 'failed';
      payment.failureReason = 'Signature mismatch';
      await payment.save({ session });
      
      order.paymentStatus = 'failed';
      await order.save({ session });
      
      logger.error(`Signature verification failed for order ${order._id}`);
      throw new Error('Invalid signature');
    }

    // Success flow
    payment.paymentId = razorpay_payment_id;
    payment.status = 'captured';
    payment.signatureVerified = true;
    await payment.save({ session });

    order.paymentStatus = 'paid';
    order.status = 'confirmed';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.invoiceNumber = generateInvoiceNumber();
    order.invoiceDate = new Date();
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    logger.info(`Payment verified and captured for order ${order._id}`);

    return { success: true, invoiceNumber: order.invoiceNumber };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Error in verifyPayment service:', error);
    throw error;
  }
};

exports.getStatus = async (userId, orderId) => {
  const order = await Order.findOne({ _id: orderId, user: userId }).select('paymentStatus status invoiceNumber');
  if (!order) throw new Error('Order not found');
  
  return {
    paymentStatus: order.paymentStatus,
    status: order.status,
    invoiceNumber: order.invoiceNumber
  };
};

exports.handleWebhook = async (webhookBody, webhookSignature) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(webhookBody))
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(webhookSignature))) {
      throw new Error('Webhook signature verification failed');
    }

    const event = webhookBody.event;
    const payload = webhookBody.payload;
    const razorpayOrderId = payload.payment?.entity?.order_id;
    const razorpayPaymentId = payload.payment?.entity?.id;

    if (!razorpayOrderId) return { success: true, message: 'Unhandled event, no order_id' };

    const payment = await Payment.findOne({ razorpayOrderId });
    const order = await Order.findOne({ razorpayOrderId });

    if (!payment || !order) {
      logger.error(`Webhook received for unknown order/payment: ${razorpayOrderId}`);
      return { success: false, message: 'Record not found' };
    }

    // Source of Truth Update
    switch (event) {
      case 'payment.captured':
        if (order.paymentStatus !== 'paid') {
          order.paymentStatus = 'paid';
          order.status = 'confirmed';
          order.razorpayPaymentId = razorpayPaymentId;
          order.invoiceNumber = order.invoiceNumber || generateInvoiceNumber();
          order.invoiceDate = order.invoiceDate || new Date();
          await order.save();

          payment.paymentId = razorpayPaymentId;
          payment.status = 'captured';
          payment.webhookStatus = 'payment.captured';
          await payment.save();
          logger.info(`Webhook: Payment captured for order ${order._id}`);
        }
        break;
      
      case 'payment.failed':
        if (order.paymentStatus !== 'paid') {
          order.paymentStatus = 'failed';
          await order.save();

          payment.status = 'failed';
          payment.failureReason = payload.payment.entity.error_description || 'Payment Failed';
          payment.webhookStatus = 'payment.failed';
          await payment.save();
          logger.info(`Webhook: Payment failed for order ${order._id}`);
        }
        break;

      default:
        logger.info(`Webhook: Unhandled event ${event}`);
    }

    return { success: true };
  } catch (error) {
    logger.error('Error processing webhook:', error);
    throw error;
  }
};

exports.refundPayment = async (paymentId, amount, reason) => {
  // Skeleton for future use
  logger.info(`Refund requested for payment ${paymentId} amount ${amount}`);
  throw new Error('Refund API not fully implemented yet');
};
