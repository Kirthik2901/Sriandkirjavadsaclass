const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'content-admin', 'super-admin', 'system-admin'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  addresses: [{
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false }
  }],
  otp: String,
  otpExpires: Date,
  pendingPhone: String,
  lastLogin: {
    type: Date,
    index: true  
  },
  isActive: {
    type: Boolean,
    default: true
  },
  cartReminderSent: {
    firstReminder: { type: Date },
    secondReminder: { type: Date },
    thirdReminder: { type: Date }
  },
  
  lastCartUpdate: Date,
  
  
  lastActive: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  currentSessionId: String,
  lastSessionStart: Date,
  
  viewedProducts: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    viewedAt: Date,
    sessionId: String
  }]
}, {
  timestamps: true
});


userSchema.index({ email: 1 });
userSchema.index({ contactNumber: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ lastActive: 1 });
userSchema.index({ currentSessionId: 1 });


userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});


userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpires = Date.now() + 10 * 60 * 1000; 
  return otp;
};

userSchema.methods.verifyOTP = function(otp) {
  if (!this.otp || !this.otpExpires) return false;
  if (this.otpExpires < Date.now()) return false;
  return this.otp === otp;
};


userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save({ validateBeforeSave: false });
};


userSchema.methods.trackProductView = function(productId, sessionId) {
  
  const alreadyViewed = this.viewedProducts.some(
    v => v.product.toString() === productId.toString() && v.sessionId === sessionId
  );
  
  if (!alreadyViewed) {
    this.viewedProducts.push({
      product: productId,
      viewedAt: new Date(),
      sessionId: sessionId
    });
    
    
    if (this.viewedProducts.length > 100) {
      this.viewedProducts = this.viewedProducts.slice(-100);
    }
  }
  
  return this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('User', userSchema);