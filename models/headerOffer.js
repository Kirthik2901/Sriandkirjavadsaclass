const mongoose = require('mongoose');

const headerOfferSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Offer text is required'],
    trim: true,
    maxlength: [200, 'Text cannot exceed 200 characters']
  },
  backgroundColor: {
    type: String,
    default: '#8b0000',
    match: [/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color']
  },
  textColor: {
    type: String,
    default: '#ffffff',
    match: [/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color']
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'inactive'
  },
  startDate: Date,
  endDate: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

headerOfferSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('HeaderOffer', headerOfferSchema);