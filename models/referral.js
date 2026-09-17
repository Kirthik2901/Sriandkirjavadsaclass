const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  /**
   * referralType:
   *   'permanent'     = The user's permanent referral code record (one per user)
   *   'relationship'  = An individual referral signup event (one per referred user)
   */
  referralType: {
    type: String,
    enum: ['permanent', 'relationship'],
    default: 'permanent'
  },

  // ─── REFERRER INFO ────────────────────────────────────────────────────────
  referrerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  referrerName: {
    type: String
  },
  referrerUsername: {
    type: String
  },

  // ─── PERMANENT REFERRAL CODE (only set on permanent-type documents) ───────
  referralCode: {
    type: String,
    sparse: true,  // allows null/undefined without violating unique
    index: true
  },

  // ─── REFERRED USER (only on relationship-type documents) ──────────────────
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referredUserName: {
    type: String
  },
  referredUserUsername: {
    type: String
  },
  referredUserCreatedAt: {
    type: Date
  },

  // ─── REFERRAL CODE USED (only on relationship documents) ──────────────────
  // Stores the permanent referral code that was used to create this relationship.
  // NOT unique — multiple relationship docs can reference the same permanent code.
  usedReferralCode: {
    type: String,
    index: true
  },

  // ─── TIMESTAMPS ───────────────────────────────────────────────────────────
  joinedAt: {
    type: Date
  },
  claimedAt: {
    type: Date
  },

  // ─── PRODUCT CONTEXT (when referral came from a product detail page) ───────
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  productName: {
    type: String
  },
  productSlug: {
    type: String
  },

  // ─── ORDER + REWARD INFO (set after qualifying purchase) ──────────────────
  qualifyingOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  eligibleSubtotal: {
    type: Number,
    default: null
  },
  friendDiscount: {
    type: Number,
    default: null
  },
  rewardCouponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
  rewardAmount: {
    type: Number,
    default: null
  },
  rewardIssuedAt: {
    type: Date
  },
  rewardExpiresAt: {
    type: Date
  },
  rewardStatus: {
    type: String,
    enum: ['none', 'pending', 'issued', 'used', 'expired'],
    default: 'none'
  },

  // ─── STATUS ───────────────────────────────────────────────────────────────
  // Permanent records: 'active' (always)
  // Relationship records: 'joined' → 'qualified' → 'reward_issued' → 'completed'
  status: {
    type: String,
    enum: ['active', 'inactive', 'joined', 'qualified', 'reward_issued', 'completed'],
    default: 'active'
  }
}, {
  timestamps: true
});

// ─── INDEXES ──────────────────────────────────────────────────────────────────

// Unique: one permanent code per user
referralSchema.index(
  { referrerUserId: 1, referralType: 1 },
  { unique: true, partialFilterExpression: { referralType: 'permanent' } }
);

// Unique: one referrer per referred user (prevent duplicate referral relationships)
referralSchema.index(
  { referredUserId: 1 },
  { unique: true, partialFilterExpression: { referralType: 'relationship' } }
);

// Unique referralCode for permanent records only
referralSchema.index(
  { referralCode: 1 },
  { unique: true, partialFilterExpression: { referralType: 'permanent' } }
);


// Query indexes
referralSchema.index({ referrerUserId: 1, referralType: 1 });
referralSchema.index({ usedReferralCode: 1 });

module.exports = mongoose.model('Referral', referralSchema);