const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true 
  },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true,
    index: true
  },
  razorpayOrderId: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true
  },
  idempotencyKey: {
    type: String,
    index: true,
    sparse: true
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  receipt: { 
    type: String, 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  status: {
    type: String,
    enum: ['created', 'authorized', 'captured', 'refunded', 'failed'],
    default: 'created',
    index: true
  },
  signatureVerified: { 
    type: Boolean, 
    default: false 
  },
  method: { 
    type: String 
  },
  webhookStatus: { 
    type: String 
  },
  failureReason: { 
    type: String 
  }
}, { 
  timestamps: true 
});

// Composite index for quickly finding user's payments
paymentSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
