const Referral = require('../models/referral');
const Coupon = require('../models/coupon');
const Notification = require('../models/notification');
const User = require('../models/user');
const Product = require('../models/product');
const referralService = require('../services/referralService');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — create a notification safely (no throw on error)
// ─────────────────────────────────────────────────────────────────────────────
const createNotification = async (payload) => {
  try {
    return await Notification.create(payload);
  } catch (err) {
    console.error('createNotification error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — idempotent notification creation (skip if already exists)
// ─────────────────────────────────────────────────────────────────────────────
const createNotificationOnce = async (query, payload) => {
  const existing = await Notification.findOne(query);
  if (existing) return existing;
  return createNotification(payload);
};

// =============================================================================
// PUBLIC: GET REFERRAL INFO BY CODE
// GET /api/referrals/info/:code
// =============================================================================
exports.getReferralInfo = async (req, res) => {
  try {
    const { code } = req.params;

    const permanent = await Referral.findOne({
      referralCode: code,
      referralType: 'permanent',
      status: 'active'
    });

    if (!permanent) {
      return res.status(404).json({ success: false, message: 'Invalid or inactive referral code' });
    }

    // Get fresh referrer name from DB
    const referrerUser = await User.findById(permanent.referrerUserId);
    const referrerName = referrerUser ? referrerUser.username : permanent.referrerName;

    res.status(200).json({
      success: true,
      data: {
        referrerName,
        discountTiers: [
          { minOrder: 1000,  discount: 100  },
          { minOrder: 2000,  discount: 200  },
          { minOrder: 3000,  discount: 300  },
          { minOrder: 5000,  discount: 500  },
          { minOrder: 10000, discount: 1000 }
        ]
      }
    });
  } catch (error) {
    console.error('getReferralInfo error:', error);
    res.status(500).json({ success: false, message: 'Failed to get referral info' });
  }
};

// =============================================================================
// GENERATE (OR RETRIEVE) PERMANENT REFERRAL LINK FOR LOGGED-IN USER
// POST /api/referrals/generate-link
// =============================================================================
exports.generateReferralLink = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productSlug } = req.body;

    const permanent = await referralService.getOrCreatePermanentReferral(userId);

    const user = await User.findById(userId);
    const usernamePath = user ? user.username : userId;

    let baseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (baseUrl.includes('localhost') && baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace('https://', 'http://');
    }

    let referralLink;
    if (productSlug) {
      referralLink = `${baseUrl}/${usernamePath}/refer/${permanent.referralCode}/${productSlug}`;
    } else {
      referralLink = `${baseUrl}/${usernamePath}/refer/${permanent.referralCode}`;
    }

    console.log('Referral link generated:', referralLink);

    res.status(200).json({
      success: true,
      data: {
        referralCode: permanent.referralCode,
        referralLink
      }
    });
  } catch (error) {
    console.error('generateReferralLink error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate referral link' });
  }
};

// =============================================================================
// REGISTER NEW USER WITH REFERRAL (called after OTP verification)
// POST /api/referrals/register-user
// Body: { referrerCode: "ABC123", productSlug?: "..." }
// =============================================================================
exports.registerReferralUser = async (req, res) => {
  try {
    const { referrerCode, productSlug } = req.body;
    const newUserId = req.user.id;

    if (!referrerCode) {
      return res.status(400).json({ success: false, message: 'referrerCode is required' });
    }

    // Attempt to claim the referral (service handles idempotency, self-referral, duplicates)
    const result = await referralService.claimReferralLink(referrerCode, newUserId, productSlug || null);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    // Idempotent notifications — only create if they don't already exist for this referral
    const referralId = result.referralId;
    const referrerId = result.referrerId;
    const referrerName = result.referrerName || 'Your friend';
    const newUserName = result.referredUserName || 'A new user';
    const joinDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Notification 1: for the REFERRER
    await createNotificationOnce(
      {
        user: referrerId,
        'data.referralId': referralId.toString(),
        type: 'referral_signup'
      },
      {
        user: referrerId,
        type: 'referral_signup',
        title: `🎉 ${newUserName} joined using your referral!`,
        message: `${newUserName} signed up on ${joinDate} using your referral link. You'll earn a reward coupon once they complete a qualifying purchase of ₹1,000 or more.`,
        read: false,
        actionUrl: '/profile',
        data: {
          referralId: referralId.toString(),
          newUserId: newUserId.toString(),
          newUserName,
          joinDate: new Date().toISOString(),
          discountTiers: [
            { minOrder: 1000, reward: 100 },
            { minOrder: 2000, reward: 200 },
            { minOrder: 3000, reward: 300 },
            { minOrder: 5000, reward: 500 },
            { minOrder: 10000, reward: 1000 }
          ]
        }
      }
    );

    // Notification 2: for the REFERRED USER
    await createNotificationOnce(
      {
        user: newUserId,
        'data.referralId': referralId.toString(),
        type: 'referral_signup'
      },
      {
        user: newUserId,
        type: 'referral_signup',
        title: '🎁 Welcome! Your Referral Discount is Active',
        message: `You were referred by ${referrerName} on ${joinDate}. You'll get a discount on eligible purchases — ₹100 off orders above ₹1,000, up to ₹1,000 off on ₹10,000+ orders. Shop now and save!`,
        read: false,
        actionUrl: '/checkout',
        data: {
          referralId: referralId.toString(),
          referrerUserId: referrerId.toString(),
          referrerName,
          joinDate: new Date().toISOString(),
          discountTiers: [
            { minOrder: 1000, reward: 100 },
            { minOrder: 2000, reward: 200 },
            { minOrder: 3000, reward: 300 },
            { minOrder: 5000, reward: 500 },
            { minOrder: 10000, reward: 1000 }
          ]
        }
      }
    );

    res.status(200).json({
      success: true,
      data: {
        registered: true,
        referrerName,
        referralId
      }
    });
  } catch (error) {
    console.error('registerReferralUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to register referral' });
  }
};

// =============================================================================
// GET REFERRAL STATS FOR LOGGED-IN USER
// GET /api/referrals/my-stats
// =============================================================================
exports.getMyReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get permanent referral record
    const permanent = await Referral.findOne({
      referrerUserId: userId,
      referralType: 'permanent'
    });

    // Get all referral relationships (people this user referred)
    const relationships = await Referral.find({
      referrerUserId: userId,
      referralType: 'relationship'
    }).sort({ createdAt: -1 });

    // Get earned referral reward coupons
    const coupons = await Coupon.find({
      userId,
      type: 'referral_reward',
      isActive: true,
      validUntil: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    const user = await User.findById(userId);

    let referralLink = null;
    let referralCode = null;

    if (permanent) {
      let baseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      if (baseUrl.includes('localhost') && baseUrl.startsWith('https://')) {
        baseUrl = baseUrl.replace('https://', 'http://');
      }
      const usernamePath = user ? user.username : userId;
      referralLink = `${baseUrl}/${usernamePath}/refer/${permanent.referralCode}`;
      referralCode = permanent.referralCode;
    }

    res.status(200).json({
      success: true,
      data: {
        referralCode,
        referralLink,
        referrerName: user ? user.username : '',
        totalReferrals: relationships.length,
        relationships: relationships.map(r => ({
          referredUserName: r.referredUserName,
          joinedAt: r.joinedAt,
          status: r.status,
          rewardAmount: r.rewardAmount,
          rewardStatus: r.rewardStatus
        })),
        earnedCoupons: coupons.map(c => ({
          code: c.code,
          amount: c.discountValue,
          minPurchase: c.minPurchase,
          validUntil: c.validUntil,
          isUsed: c.usedCount > 0,
          description: c.description
        }))
      }
    });
  } catch (error) {
    console.error('getMyReferralStats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get referral stats' });
  }
};

// =============================================================================
// GET USER'S AVAILABLE COUPONS (for checkout)
// GET /api/referrals/my-coupons
// =============================================================================
exports.getMyCoupons = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Personal coupons (referral rewards assigned to this user)
    const personalCoupons = await Coupon.find({
      userId,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gt: now }
    }).sort({ type: 1, discountValue: -1 });

    // Filter out fully used coupons
    const validPersonal = personalCoupons.filter(c => {
      if (c.usageLimit === null) return true;
      return c.usedCount < c.usageLimit;
    });

    // Public admin coupons (showForAllUsers = true)
    const publicCoupons = await Coupon.find({
      type: 'admin',
      showForAllUsers: true,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gt: now }
    }).sort({ discountValue: -1 });

    const validPublic = publicCoupons.filter(c => {
      if (c.usageLimit === null) return true;
      return c.usedCount < c.usageLimit;
    });

    // Merge, deduplicate
    const allCoupons = [...validPersonal, ...validPublic.filter(pc =>
      !validPersonal.some(vp => vp._id.toString() === pc._id.toString())
    )];

    res.status(200).json({
      success: true,
      data: {
        coupons: allCoupons.map(c => ({
          code: c.code,
          type: c.type,
          discountType: c.discountType,
          discountValue: c.discountValue,
          maxDiscount: c.maxDiscount,
          minPurchase: c.minPurchase,
          validUntil: c.validUntil,
          isPersonal: !!c.userId,
          showForAllUsers: c.showForAllUsers,
          description: c.description || getDefaultDescription(c)
        }))
      }
    });
  } catch (error) {
    console.error('getMyCoupons error:', error);
    res.status(500).json({ success: false, message: 'Failed to get coupons' });
  }
};

function getDefaultDescription(coupon) {
  if (coupon.type === 'referral_reward') {
    return `Referral reward — ₹${coupon.discountValue} off on orders above ₹${coupon.minPurchase}`;
  }
  if (coupon.discountType === 'percentage') {
    return `${coupon.discountValue}% off${coupon.maxDiscount ? ` (max ₹${coupon.maxDiscount})` : ''}`;
  }
  return `₹${coupon.discountValue} off on orders above ₹${coupon.minPurchase}`;
}

// =============================================================================
// PROCESS REFERRAL REWARD ON ORDER COMPLETION
// Called internally from orderController when an order is paid.
// =============================================================================
exports.processReferralOnOrder = async (orderId, referredUserId, orderItems) => {
  try {
    console.log(`[Referral] Processing order ${orderId} for user ${referredUserId}`);

    // Find the referral relationship for this user
    const relationship = await Referral.findOne({
      referredUserId,
      referralType: 'relationship'
    });

    if (!relationship) {
      console.log('[Referral] No referral relationship found for user:', referredUserId);
      return null;
    }

    // Check if reward already processed for this relationship
    if (relationship.qualifyingOrderId) {
      console.log('[Referral] Reward already processed for relationship:', relationship._id);
      return null;
    }

    // Calculate eligible subtotal from actual order items
    const eligibleSubtotal = referralService.calculateEligibleSubtotal(orderItems);
    console.log(`[Referral] Eligible subtotal: ₹${eligibleSubtotal}`);

    if (eligibleSubtotal < 1000) {
      console.log('[Referral] Eligible subtotal too low for referral reward');
      return null;
    }

    const referrerId = relationship.referrerUserId;

    // Fetch user data for notifications
    const referredUser = await User.findById(referredUserId);
    const referrerUser = await User.findById(referrerId);
    const referredUserName = referredUser ? referredUser.username : 'your referred friend';
    const referrerName = referrerUser ? referrerUser.username : 'your referrer';

    // Create reward coupons for BOTH referrer and referred user (idempotent)
    const { referrerCoupon, referredCoupon } = await referralService.createReferralRewardCoupons(
      referrerId,
      referredUserId,
      eligibleSubtotal,
      orderId,
      relationship._id
    );

    if (!referrerCoupon) {
      console.log('[Referral] No reward generated (tier too low or already exists)');
      return null;
    }

    const orderDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Notification for the REFERRER — they earned a reward coupon
    await createNotificationOnce(
      {
        user: referrerId,
        'data.couponCode': referrerCoupon.code,
        type: 'referral_reward'
      },
      {
        user: referrerId,
        type: 'referral_reward',
        title: `🎁 You earned ₹${referrerCoupon.discountValue} — Referral Reward!`,
        message: `${referredUserName} placed a qualifying order on ${orderDate}. Your reward coupon "${referrerCoupon.code}" gives ₹${referrerCoupon.discountValue} off on orders above ₹${referrerCoupon.minPurchase}. Valid for 6 months.`,
        read: false,
        actionUrl: '/profile',
        data: {
          couponCode: referrerCoupon.code,
          couponAmount: referrerCoupon.discountValue,
          minPurchase: referrerCoupon.minPurchase,
          orderId: orderId.toString(),
          referredUserName,
          referralId: relationship._id.toString(),
          orderDate: new Date().toISOString(),
          validUntil: referrerCoupon.validUntil
        }
      }
    );

    // Notification for the REFERRED USER — they also earned a reward coupon
    if (referredCoupon) {
      await createNotificationOnce(
        {
          user: referredUserId,
          'data.couponCode': referredCoupon.code,
          type: 'coupon_earned'
        },
        {
          user: referredUserId,
          type: 'coupon_earned',
          title: `🎉 You earned a ₹${referredCoupon.discountValue} reward coupon!`,
          message: `Thank you for your purchase! As a referred customer, you've earned coupon "${referredCoupon.code}" — ₹${referredCoupon.discountValue} off on orders above ₹${referredCoupon.minPurchase}. Valid for 6 months. Use it on your next order!`,
          read: false,
          actionUrl: '/checkout',
          data: {
            couponCode: referredCoupon.code,
            couponAmount: referredCoupon.discountValue,
            minPurchase: referredCoupon.minPurchase,
            orderId: orderId.toString(),
            referrerName,
            orderDate: new Date().toISOString(),
            validUntil: referredCoupon.validUntil
          }
        }
      );
    }

    console.log(`[Referral] Referrer coupon ${referrerCoupon.code} (₹${referrerCoupon.discountValue}) created`);
    if (referredCoupon) {
      console.log(`[Referral] Referred user coupon ${referredCoupon.code} (₹${referredCoupon.discountValue}) created`);
    }

    return {
      referrerCouponCode: referrerCoupon.code,
      referredCouponCode: referredCoupon ? referredCoupon.code : null,
      couponAmount: referrerCoupon.discountValue
    };
  } catch (error) {
    console.error('processReferralOnOrder error:', error);
    return null;
  }
};

// =============================================================================
// TRACK REFERRAL CLICK (stub — no analytics, just returns referral info)
// POST /api/referrals/track-click
// =============================================================================
exports.trackReferralClick = async (req, res) => {
  try {
    const { referrerCode, productSlug } = req.body;

    if (!referrerCode) {
      return res.status(400).json({ success: false, message: 'referrerCode is required' });
    }

    const permanent = await Referral.findOne({
      referralCode: referrerCode,
      referralType: 'permanent',
      status: 'active'
    });

    if (!permanent) {
      return res.status(404).json({ success: false, message: 'Invalid referral code' });
    }

    const referrerUser = await User.findById(permanent.referrerUserId);
    const referrerName = referrerUser ? referrerUser.username : permanent.referrerName;

    res.status(200).json({
      success: true,
      data: {
        referrerCode,
        referrerName,
        productSlug: productSlug || null,
        message: 'Referral info retrieved'
      }
    });
  } catch (error) {
    console.error('trackReferralClick error:', error);
    res.status(500).json({ success: false, message: 'Failed to process referral click' });
  }
};

// =============================================================================
// CALCULATE REFERRAL DISCOUNT (for checkout display)
// POST /api/referrals/calculate-discount
// =============================================================================
exports.calculateReferralDiscount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user is a referred user
    const relationship = await Referral.findOne({
      referredUserId: userId,
      referralType: 'relationship'
    });

    if (!relationship) {
      return res.status(200).json({
        success: true,
        data: { hasReferralDiscount: false, discount: 0 }
      });
    }

    // Return tier info (actual calculation happens at order time)
    res.status(200).json({
      success: true,
      data: {
        hasReferralDiscount: true,
        referredBy: relationship.referrerName,
        tiers: [
          { minOrder: 1000,  discount: 100  },
          { minOrder: 2000,  discount: 200  },
          { minOrder: 3000,  discount: 300  },
          { minOrder: 5000,  discount: 500  },
          { minOrder: 10000, discount: 1000 }
        ]
      }
    });
  } catch (error) {
    console.error('calculateReferralDiscount error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate discount' });
  }
};

// =============================================================================
// NOTIFICATIONS — GET
// GET /api/referrals/notifications
// =============================================================================
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = 'false' } = req.query;

    const query = { user: userId };
    if (unreadOnly === 'true') query.read = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ user: userId, read: false });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
};

// =============================================================================
// NOTIFICATIONS — MARK ONE AS READ
// PATCH /api/referrals/notifications/:id/read
// =============================================================================
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: { notification } });
  } catch (error) {
    console.error('markNotificationRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

// =============================================================================
// NOTIFICATIONS — MARK ALL AS READ
// PATCH /api/referrals/notifications/read-all
// =============================================================================
exports.markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await Notification.updateMany({ user: userId, read: false }, { read: true });
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('markAllNotificationsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
};

// =============================================================================
// ADMIN — GET ALL REFERRALS
// GET /api/referrals/admin/all
// =============================================================================
exports.getAllReferrals = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = '' } = req.query;

    const query = {};
    if (type) query.referralType = type;

    const referrals = await Referral.find(query)
      .populate('referrerUserId', 'username email')
      .populate('referredUserId', 'username email')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Referral.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        referrals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('getAllReferrals error:', error);
    res.status(500).json({ success: false, message: 'Failed to get referrals' });
  }
};