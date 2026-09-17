const paymentService = require('./payment.service');

exports.createOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id; // Assuming protect middleware sets req.user

    const result = await paymentService.createOrder(userId, orderId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const userId = req.user._id;

    const result = await paymentService.verifyPayment(
      userId, 
      orderId, 
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const result = await paymentService.getStatus(userId, orderId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.handleWebhook = async (req, res, next) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    
    if (!webhookSignature) {
      return res.status(400).json({ success: false, message: 'Missing signature' });
    }

    // req.body should be raw buffer here due to express.raw middleware
    let webhookBody;
    try {
      webhookBody = JSON.parse(req.body.toString('utf8'));
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const result = await paymentService.handleWebhook(webhookBody, webhookSignature);

    res.status(200).json(result);
  } catch (error) {
    // We don't want to leak errors to razorpay, just log and return 400
    next(error);
  }
};

exports.refundPayment = async (req, res, next) => {
  try {
    const { paymentId, amount, reason } = req.body;
    const result = await paymentService.refundPayment(paymentId, amount, reason);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
