const mongoose = require('mongoose');

/**
 * A customer request to replace or refund a delivered order item.
 * Photos are stored as ImageKit references (URL + fileId). The evidence video is
 * stored on backend-controlled storage and may only be downloaded once by an admin.
 */

const photoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  fileId: { type: String }
}, { _id: false });

const videoSchema = new mongoose.Schema({
  storagePath: { type: String, select: false },
  filename: { type: String },
  mimetype: { type: String },
  size: { type: Number },
  downloadCount: { type: Number, default: 0 },
  downloadedAt: { type: Date },
  downloadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const refundSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['RAZORPAY', 'UPI_MANUAL', null],
    default: null
  },
  // Encrypted at rest; hidden from default queries.
  upiId: { type: String, select: false },
  upiIdMasked: { type: String },
  razorpayRefundId: { type: String },
  amount: { type: Number, min: 0 },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSED', 'MANUAL_PENDING', 'FAILED', null],
    default: null
  },
  processedAt: { type: Date }
}, { _id: false });

const replacementRequestSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    enum: ['DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'QUALITY_ISSUE', 'OTHER'],
    required: true
  },
  reasonText: {
    type: String,
    required: function () {
      return this.reason === 'OTHER';
    }
  },
  photos: {
    type: [photoSchema],
    default: []
  },
  video: {
    type: videoSchema,
    default: undefined
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
    index: true
  },
  resolution: {
    type: String,
    enum: ['REPLACEMENT', 'REFUND', null],
    default: null
  },
  refund: {
    type: refundSchema,
    default: () => ({})
  },
  // Reverse pickup (customer -> warehouse) tracking.
  reversePickup: {
    scheduled: { type: Boolean, default: false },
    scheduledAt: { type: Date },
    provider: { type: String },
    reference: { type: String }
  },
  replacementOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  rejectionReason: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date }
}, {
  timestamps: true
});

replacementRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ReplacementRequest', replacementRequestSchema);
