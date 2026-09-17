const mongoose = require('mongoose');

const referralClickSchema = new mongoose.Schema({
  referrerCode: {
    type: String,
    required: true,
    index: true
  },
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productSlug: String,
  newUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  ipAddress: String,
  userAgent: String,
  sessionId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['clicked', 'registered', 'purchased', 'expired'],
    default: 'clicked'
  },
  clickedAt: {
    type: Date,
    default: Date.now
  },
  registeredAt: Date,
  purchasedAt: Date,
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderAmount: Number,
  discountApplied: Number
}, {
  timestamps: true
});

referralClickSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  }
  next();
});

referralClickSchema.methods.isValidForPurchase = function() {
  return this.status !== 'expired' && 
         this.status !== 'purchased' && 
         new Date() < this.expiresAt;
};

referralClickSchema.index({ newUser: 1, status: 1 });

module.exports = mongoose.model('ReferralClick', referralClickSchema);