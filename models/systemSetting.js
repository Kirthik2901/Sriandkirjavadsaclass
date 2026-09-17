const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['general', 'shipping', 'payment', 'tax', 'email', 'sms', 'analytics', 'security'],
    required: true
  },
  key: {
    type: String,
    required: true,
    trim: true
  },
  value: mongoose.Schema.Types.Mixed,
  label: String,
  description: String,
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'array', 'object', 'json'],
    default: 'string'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});


systemSettingsSchema.index({ category: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
