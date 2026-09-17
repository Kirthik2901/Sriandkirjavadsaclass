const Coupon = require('../models/coupon');
const crypto = require('crypto');


exports.validateCoupon = async (req, res) => {
  try {
    const { code, cartTotal, productIds } = req.body;
    const userId = req.user.id;

    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }

    // Personal coupon check — must belong to this user
    if (coupon.userId && coupon.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'This coupon is not available for your account' });
    }

    // Usage limit check — null/undefined means unlimited
    if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    // Already used check (for single-use referral coupons)
    const alreadyUsed = coupon.usedBy && coupon.usedBy.some(usage => usage.user.toString() === userId);
    if (alreadyUsed && (coupon.type === 'referral' || coupon.type === 'referral_reward')) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon' });
    }

    const Cart = require('../models/cart');
    const Product = require('../models/product');

    let effectiveSubtotal = Number(cartTotal) || 0;
    let eligibleSubtotal = effectiveSubtotal;
    let eligibleProducts = [];
    let ineligibleProducts = [];

    const userCart = await Cart.findOne({ user: userId }).populate('items.product');
    const isReferralCoupon = coupon.type === 'referral' || coupon.type === 'referral_reward' || !!coupon.referralId || !!coupon.referrerUserId || !!coupon.referredUserId || !!coupon.userId;
    
    if (userCart && userCart.items && userCart.items.length > 0) {
      if (isReferralCoupon) {
        eligibleSubtotal = 0;
        userCart.items.forEach(item => {
          if (item.product) {
            const isEligible = item.product.referral_coupon_eligible !== false && item.product.referralCouponEligible !== false;
            const price = Number(item.sellingPrice) || Number(item.product.sellingPrice) || 0;
            const qty = Number(item.quantity) || 1;
            if (isEligible) {
              eligibleSubtotal += (price * qty);
              eligibleProducts.push(item.product.name);
            } else {
              ineligibleProducts.push(item.product.name);
            }
          }
        });

        if (eligibleSubtotal === 0) {
          return res.status(400).json({
            success: false,
            message: 'None of the items in your cart are eligible for referral coupons.'
          });
        }

        effectiveSubtotal = eligibleSubtotal;
      }
    }

    // Minimum purchase check
    if (effectiveSubtotal < coupon.minPurchase) {
      const isRef = coupon.type === 'referral' || coupon.type === 'referral_reward';
      return res.status(400).json({ 
        success: false, 
        message: isRef && ineligibleProducts.length > 0
          ? `Minimum purchase of ₹${coupon.minPurchase} required on eligible products. (Current eligible amount: ₹${effectiveSubtotal})`
          : `Minimum purchase of ₹${coupon.minPurchase} required for this coupon` 
      });
    }

    // Applicable products check (if explicitly restricted by coupon)
    if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
      const hasApplicableProduct = productIds && productIds.some(id => 
        coupon.applicableProducts.some(p => p.toString() === id)
      );
      if (!hasApplicableProduct) {
        return res.status(400).json({ 
          success: false, 
          message: 'Coupon not applicable to cart items' 
        });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (effectiveSubtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, effectiveSubtotal);

    res.json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          type: coupon.type,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscount: coupon.maxDiscount,
          minPurchase: coupon.minPurchase,
          discountAmount: Math.round(discountAmount),
          eligibleSubtotal: Math.round(effectiveSubtotal),
          eligibleProducts,
          ineligibleProducts
        }
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to validate coupon' });
  }
};


exports.applyCouponToOrder = async (couponCode, userId, orderId) => {
  try {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    
    if (coupon) {
      coupon.usedCount += 1;
      coupon.usedBy.push({
        user: userId,
        order: orderId,
        usedAt: new Date()
      });
      await coupon.save();
    }
  } catch (error) {
    console.error('Apply coupon to order error:', error);
  }
};


exports.getUserCoupons = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const now = new Date();

    const orConditions = [
      { type: 'admin', showForAllUsers: true }
    ];
    if (userId) {
      orConditions.push({ userId: userId });
    }

    const coupons = await Coupon.find({
      $or: orConditions,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now }
    }).select('-usedBy').sort({ createdAt: -1 });

    // Deduplicate by _id and filter out exhausted or expired coupons
    const seen = new Set();
    const availableCoupons = coupons.filter(coupon => {
      const idStr = coupon._id.toString();
      if (seen.has(idStr)) return false;
      seen.add(idStr);

      // Usage limit check
      if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
        return false;
      }

      // Expiry check
      if (coupon.validUntil && new Date(coupon.validUntil) < now) {
        return false;
      }

      return true;
    });

    res.json({
      success: true,
      data: {
        coupons: availableCoupons.map(c => ({
          _id: c._id,
          code: c.code,
          type: c.type,
          discountType: c.discountType,
          discountValue: c.discountValue,
          maxDiscount: c.maxDiscount,
          minPurchase: c.minPurchase,
          validUntil: c.validUntil,
          isActive: c.isActive,
          showForAllUsers: c.showForAllUsers,
          isPersonal: !!c.userId,
          referralId: c.referralId,
          applicableCategories: c.applicableCategories,
          applicableSubcategories: c.applicableSubcategories,
          applicableProducts: c.applicableProducts,
          description: c.description || (
            c.type === 'referral_reward'
              ? `Referral reward — ₹${c.discountValue} off on eligible orders above ₹${c.minPurchase}`
              : c.discountType === 'percentage'
              ? `${c.discountValue}% off${c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}`
              : `₹${c.discountValue} off on orders above ₹${c.minPurchase}`
          )
        }))
      }
    });
  } catch (error) {
    console.error('Get user coupons error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
};




exports.createAdminCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minPurchase,
      maxDiscount,
      usageLimit,
      validUntil,
      applicableCategories,
      applicableSubcategories,
      applicableProducts,
      showForAllUsers,
      description
    } = req.body;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const expiryDate = new Date(validUntil);
    if (!isNaN(expiryDate.getTime())) {
      expiryDate.setHours(23, 59, 59, 999);
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      type: 'admin',
      discountType,
      discountValue: Number(discountValue),
      minPurchase: Number(minPurchase) || 0,
      maxDiscount: maxDiscount ? Number(maxDiscount) : null,
      usageLimit: usageLimit !== undefined && usageLimit !== null && usageLimit !== '' ? Number(usageLimit) : 1000,
      validFrom: new Date(),
      validUntil: expiryDate,
      applicableCategories: applicableCategories || [],
      applicableSubcategories: applicableSubcategories || [],
      applicableProducts: applicableProducts || [],
      showForAllUsers: !!showForAllUsers,
      description: description || '',
      createdBy: req.user?._id || req.user?.id
    });

    res.status(201).json({ success: true, data: { coupon } });
  } catch (error) {
    console.error('Create admin coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to create coupon' });
  }
};


exports.getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isActive } = req.query;

    const query = {};
    if (type && type.trim()) query.type = type.trim();
    if (isActive !== undefined && isActive !== '') query.isActive = isActive === 'true';

    const coupons = await Coupon.find(query)
      .populate('createdBy', 'username email name')
      .populate('userId', 'username email name')
      .populate('applicableCategories', 'name')
      .populate('applicableSubcategories', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Coupon.countDocuments(query);

    res.json({
      success: true,
      data: {
        coupons,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalCoupons: total,
          totalItems: total,
          total: total
        }
      }
    });
  } catch (error) {
    console.error('Get all coupons error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
};


exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if (coupon.type === 'referral' || coupon.type === 'referral_reward') {
      delete updates.code;
      delete updates.type;
    }

    if (updates.code) {
      updates.code = updates.code.toUpperCase().trim();
    }

    if (updates.validUntil) {
      const expiryDate = new Date(updates.validUntil);
      if (!isNaN(expiryDate.getTime())) {
        expiryDate.setHours(23, 59, 59, 999);
        updates.validUntil = expiryDate;
      }
    }

    if (updates.showForAllUsers !== undefined) {
      updates.showForAllUsers = !!updates.showForAllUsers;
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: { coupon: updatedCoupon } });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to update coupon' });
  }
};


exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if ((coupon.type === 'referral' || coupon.type === 'referral_reward') && coupon.usedCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete used referral coupon' 
      });
    }

    await Coupon.findByIdAndDelete(id);

    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
};