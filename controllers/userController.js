const User = require('../models/user');
const Cart = require('../models/cart');
const Order = require('../models/order');
const { sendEmailOTP } = require('../services/emailService');




exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '' } = req.query;

    const query = { role: { $ne: 'super-admin' } };
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { contactNumber: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -otp')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalUsers: total
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};


exports.getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password -otp');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'super-admin' && req.user.role !== 'super-admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const [cart, orders] = await Promise.all([
      Cart.findOne({ user: id }).populate('items.product', 'name sellingPrice gallery stock'),
      Order.find({ user: id })
        .populate('items.product', 'name gallery')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    res.json({
      success: true,
      data: { 
        user, 
        cart: cart || { items: [] }, 
        recentOrders: orders 
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user details' });
  }
};


exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'content-admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'super-admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot change super admin role' 
      });
    }

    user.role = role;
    await user.save();

    res.json({ 
      success: true, 
      message: 'User role updated successfully', 
      data: user 
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
};


exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'super-admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot delete super admin' 
      });
    }

    
    await Promise.all([
      Cart.deleteOne({ user: id }), 
      Order.deleteMany({ user: id })
    ]);
    
    await User.findByIdAndDelete(id);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};




exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};


exports.updateUserProfile = async (req, res) => {
  try {
    const { username, email } = req.body;
    
    console.log('Update profile request:', { username, email });
    
    const user = await User.findById(req.user.id).select('-password -otp');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    
    if (username) {
      if (username.trim().length < 2) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username must be at least 2 characters' 
        });
      }
      user.username = username.trim();
    }
    
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid email format' 
        });
      }
      
      
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.user.id }
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already in use' 
        });
      }
      
      user.email = email.toLowerCase().trim();
    }

    await user.save();

    console.log('Profile updated successfully');

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};




exports.getUserAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('addresses');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user.addresses || [] });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch addresses' });
  }
};


exports.saveUserAddress = async (req, res) => {
  try {
    const { fullName, phone, email, addressLine1, addressLine2, city, state, pincode, isDefault } = req.body;

    console.log('Save address request:', req.body);

    
    if (!fullName || !phone || !addressLine1 || !city || !state || !pincode) {
      console.error('Validation failed - missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'All required fields must be provided (fullName, phone, addressLine1, city, state, pincode)' 
      });
    }

    
    if (!/^[0-9]{10}$/.test(phone.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number must be exactly 10 digits' 
      });
    }

    
    if (!/^[A-Z0-9\s-]{3,10}$/i.test(pincode.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid postal code format' 
      });
    }

    
    if (fullName.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Full name must be at least 2 characters' 
      });
    }

    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    
    if (!user.addresses) {
      user.addresses = [];
    }

    
    const shouldBeDefault = user.addresses.length === 0 || isDefault === true;

    
    if (shouldBeDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    
    const newAddress = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : undefined,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : undefined,
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim().toUpperCase(),
      isDefault: shouldBeDefault
    };

    console.log('Adding new address:', newAddress);

    user.addresses.push(newAddress);
    await user.save();

    console.log('Address saved successfully');

    res.status(201).json({ 
      success: true, 
      message: 'Address added successfully',
      data: user.addresses
    });
  } catch (error) {
    console.error('Save address error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.updateUserAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const { fullName, phone, email, addressLine1, addressLine2, city, state, pincode, isDefault } = req.body;

    console.log('Update address request:', addressId, req.body);

    
    if (phone && !/^[0-9]{10}$/.test(phone.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number must be exactly 10 digits' 
      });
    }

    
    if (pincode && !/^[A-Z0-9\s-]{3,10}$/i.test(pincode.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid postal code format' 
      });
    }

    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    
    if (fullName) address.fullName = fullName.trim();
    if (phone) address.phone = phone.trim();
    if (email !== undefined) address.email = email ? email.trim() : undefined;
    if (addressLine1) address.addressLine1 = addressLine1.trim();
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2 ? addressLine2.trim() : undefined;
    if (city) address.city = city.trim();
    if (state) address.state = state.trim();
    if (pincode) address.pincode = pincode.trim().toUpperCase();

    
    if (isDefault === true) {
      user.addresses.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
      address.isDefault = true;
    }

    await user.save();

    console.log('Address updated successfully');

    res.json({ 
      success: true, 
      message: 'Address updated successfully',
      data: user.addresses
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.deleteUserAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    console.log('Delete address request:', addressId);

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const wasDefault = address.isDefault;
    
    
    address.remove();

    
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    console.log('Address deleted successfully');

    res.json({ 
      success: true, 
      message: 'Address deleted successfully',
      data: user.addresses
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    console.log('Set default address request:', addressId);

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    
    user.addresses.forEach(addr => {
      addr.isDefault = false;
    });
    
    
    address.isDefault = true;

    await user.save();

    console.log('Default address updated successfully');

    res.json({ 
      success: true, 
      message: 'Default address updated successfully',
      data: user.addresses
    });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to set default address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};




exports.requestPhoneChangeOTP = async (req, res) => {
  try {
    const { newPhone } = req.body;

    console.log('Request phone OTP:', newPhone);

    if (!newPhone || !/^[0-9]{10}$/.test(newPhone)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid 10-digit phone number required' 
      });
    }

    
    const existingUser = await User.findOne({ 
      contactNumber: newPhone,
      _id: { $ne: req.user.id }
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number already in use' 
      });
    }

    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); 

    console.log('Generated OTP:', otp, 'Expires:', otpExpires);

    
    const user = await User.findById(req.user.id);
    user.otp = otp;
    user.otpExpires = otpExpires;
    user.pendingPhone = newPhone;
    await user.save();

    
    try {
      await sendEmailOTP(user.email, otp);
      console.log('OTP sent successfully to email');
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    res.json({ 
      success: true, 
      message: 'OTP sent to your email successfully',
      
      ...(process.env.NODE_ENV === 'development' && { otp })
    });
  } catch (error) {
    console.error('Request phone OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.verifyAndUpdatePhone = async (req, res) => {
  try {
    const { newPhone, otp } = req.body;

    console.log('Verify phone OTP:', { newPhone, otp });

    if (!newPhone || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and OTP required' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('User OTP data:', {
      storedOTP: user.otp,
      providedOTP: otp,
      otpExpires: user.otpExpires,
      pendingPhone: user.pendingPhone
    });

    
    if (user.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    
    if (new Date() > user.otpExpires) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP expired. Please request a new one.' 
      });
    }

    
    if (user.pendingPhone !== newPhone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number mismatch' 
      });
    }

    
    user.contactNumber = newPhone;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.pendingPhone = undefined;
    
    await user.save();

    console.log('Phone number updated successfully');

    res.json({ 
      success: true, 
      message: 'Phone number updated successfully'
    });
  } catch (error) {
    console.error('Verify phone OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};