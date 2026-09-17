const Coupon = require('../../models/coupon');


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
      applicableSubcategories
    } = req.body;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
console.log("BODY =", req.body);


    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      type: 'admin', 
      discountType,
      discountValue,
      minPurchase: minPurchase || 0,
      maxDiscount,
      usageLimit: usageLimit || 1000,
      validFrom: new Date(),
      validUntil: new Date(validUntil),
      applicableCategories: applicableCategories || [],
      applicableSubcategories: applicableSubcategories || [],
      applicableProducts: [], 
      createdBy: req.user.id
    });
console.log("USER =", req.user);
    res.status(201).json({ success: true, data: { coupon } });
  } catch (error) {
    console.error('Create admin coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to create coupon' });
  }
};


exports.getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isActive } = req.query;

    const query = { type: 'admin' }; 
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const coupons = await Coupon.find(query)
      .populate('createdBy', 'username email')
      .populate('applicableCategories', 'name')
      .populate('applicableSubcategories', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Coupon.countDocuments(query);

    res.json({
      success: true,
      data: {
        coupons,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalCoupons: total
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
    const updates = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if (coupon.type === 'referral') {
      return res.status(400).json({ success: false, message: 'Cannot edit referral coupons' });
    }

    delete updates.code;
    delete updates.type;

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

    if (coupon.type === 'referral') {
      return res.status(400).json({ success: false, message: 'Cannot delete referral coupons' });
    }

    await Coupon.findByIdAndDelete(id);

    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
};