const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  image: {
    desktop: {
      url: String,
      fileId: String
    },
    mobile: {
      url: String,
      fileId: String
    }
  },
  video: {
    url: String,
    thumbnail: String,
    filePath: String
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    default: 'image',
    required: true
  },
  link: {
    url: String
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'scheduled'],
    default: 'inactive'
  },
  startDate: Date,
  endDate: Date,
  analytics: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    uniqueClicks: { type: Number, default: 0 },
    viewedBy: [{ type: String }], 
    clickedBy: [{ type: String }]
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

bannerSchema.pre('validate', function(next) {
  if (this.mediaType === 'image' && !this.image?.desktop?.url) {
    this.invalidate('image.desktop.url', 'Desktop image URL is required for image banners');
  }
  if (this.mediaType === 'video' && !this.video?.url) {
    this.invalidate('video.url', 'Video URL is required for video banners');
  }
  next();
});

bannerSchema.index({ status: 1, priority: -1 });

module.exports = mongoose.model('Banner', bannerSchema);