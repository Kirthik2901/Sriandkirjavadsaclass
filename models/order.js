const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
    slug: String,
  image: String,
  variant: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },

  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  // Review tracking
  reviewed: {
    type: Boolean,
    default: false
  }
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  items: [orderItemSchema],
  
  // Shipping Details
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: String,
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' }
  },
  
  // Payment Details
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'cod'],
    default: 'cod',
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'payment_initiated', 'authorized', 'captured', 'paid', 'failed', 'cancelled', 'expired', 'refund_pending', 'refunded'],
    default: 'pending',
    index: true
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  
  // Pricing
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  couponCode: {
    type: String,
    uppercase: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Order Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending',
    index: true
  },
  
  // Invoice Details
  invoiceNumber: {
    type: String,
    sparse: true,
    index: true
  },
  invoiceDate: Date,
  invoiceUrl: String,
  
  // Tracking
  trackingNumber: String,
  shippingProvider: String,
  
  // Timestamps for status changes
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  
  // Replacement / Return Request
  returnRequest: {
    requested: { type: Boolean, default: false },
    requestedAt: Date,
    reason: String,
    // Proof media supplied by the customer
    images: [{ url: String, fileId: String }],
    videos: [{ url: String, thumbnail: String }],
    status: {
      type: String,
      enum: [
        'pending', 'approved', 'rejected',
        'pickup_scheduled', 'picked_up',
        'replacement_shipped', 'replaced',
        'refund_pending', 'refunded', 'completed'
      ],
      default: 'pending'
    },
    approvedAt: Date,
    rejectedAt: Date,
    completedAt: Date,
    adminNotes: String,
    // Return shipment pickup
    pickup: {
      scheduled: { type: Boolean, default: false },
      scheduledAt: Date,
      pickedUp: { type: Boolean, default: false },
      pickedUpAt: Date,
      trackingNumber: String,
      provider: String,
      shiprocketReturnOrderId: String,
      shiprocketShipmentId: String
    },
    // Replacement fulfilment
    replacementItemOutOfStock: { type: Boolean, default: false },
    replacementShippedAt: Date,
    replacementTrackingNumber: String,
    // Refund (only when replacement stock is unavailable)
    refundUpiId: String,          // COD: customer-provided UPI id
    refundAmount: Number,
    refundMethod: String,         // 'upi' (COD) | 'razorpay' (online)
    refundTransactionId: String,  // COD: admin payment ref | Razorpay: refund id
    refundIdempotencyKey: String, // reused across retries for the Razorpay refund
    refundInitiatedAt: Date,
    refundedAt: Date
  },
  
  // Notes
  customerNotes: String,
  adminNotes: String,
  
  // Cancellation
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['customer', 'admin', 'system']
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'items.product': 1 });

// Generate unique order number before saving
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.orderNumber = `ORD${timestamp}${random}`;
    
    // Ensure uniqueness
    const exists = await mongoose.model('Order').findOne({ orderNumber: this.orderNumber });
    if (exists) {
      this.orderNumber = `ORD${timestamp}${random + 1}`;
    }
  }
  next();
});

// Virtual for checking if order can be reviewed
orderSchema.virtual('canBeReviewed').get(function() {
  return this.status === 'delivered';
});

// Method to check if a specific product has been reviewed
orderSchema.methods.isProductReviewed = function(productId) {
  const item = this.items.find(item => 
    item.product.toString() === productId.toString()
  );
  return item ? item.reviewed : false;
};

// Method to mark product as reviewed
orderSchema.methods.markProductReviewed = async function(productId) {
  const item = this.items.find(item => 
    item.product.toString() === productId.toString()
  );
  
  if (item) {
    item.reviewed = true;
    await this.save();
    return true;
  }
  return false;
};

// Static method to get reviewable orders for a user
orderSchema.statics.getReviewableOrders = function(userId, productId) {
  return this.find({
    user: userId,
    status: 'delivered',
    'items.product': productId,
    'items.reviewed': false
  }).sort({ deliveredAt: -1 });
};

module.exports = mongoose.model('Order', orderSchema);