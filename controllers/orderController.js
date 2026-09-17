const Order = require('../models/order');
const Cart = require('../models/cart');
const Product = require('../models/product');
const User = require('../models/user');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const fsp = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PDFDocument = require('pdfkit');
const { applyCouponToOrder } = require('./couponController');
const referralController = require('./referralController');
const shiprocketService = require('../services/shiprocketService');
const razorpayIdempotent = require('../utils/razorpayIdempotent');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Transcodes a return-proof video to webm and generates a thumbnail (max 30s).
function processReturnVideo(videoFile) {
  return new Promise((resolve, reject) => {
    const inputPath = videoFile.path;
    const outputDir = path.join(process.cwd(), 'uploads', 'videos', 'returns');
    const filename = `return_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputPath = path.join(outputDir, `${filename}.webm`);
    const thumbnailPath = path.join(outputDir, `${filename}_thumb.webp`);

    fsp.mkdir(outputDir, { recursive: true })
      .catch((err) => console.error('Error creating return video directory:', err))
      .finally(() => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) return reject(err);

          const duration = metadata.format.duration;
          if (duration > 30) {
            fsp.unlink(inputPath).catch(() => {});
            return reject(new Error('Video must be 30 seconds or less'));
          }

          ffmpeg(inputPath)
            .output(outputPath)
            .videoCodec('libvpx-vp9')
            .audioBitrate('128k')
            .videoBitrate('1500k')
            .size('1280x?')
            .outputOptions(['-crf 32', '-b:v 0', '-row-mt 1', '-cpu-used 2', '-deadline good'])
            .format('webm')
            .on('end', () => {
              ffmpeg(outputPath)
                .screenshots({
                  timestamps: ['1'],
                  filename: `${filename}_thumb.jpg`,
                  folder: outputDir,
                  size: '640x360'
                })
                .on('end', async () => {
                  try {
                    await sharp(path.join(outputDir, `${filename}_thumb.jpg`))
                      .webp({ quality: 80 })
                      .toFile(thumbnailPath);

                    await fsp.unlink(inputPath).catch(() => {});
                    await fsp.unlink(path.join(outputDir, `${filename}_thumb.jpg`)).catch(() => {});

                    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
                    resolve({
                      url: `${baseUrl}/uploads/videos/returns/${filename}.webm`,
                      thumbnail: `${baseUrl}/uploads/videos/returns/${filename}_thumb.webp`
                    });
                  } catch (thumbErr) {
                    reject(thumbErr);
                  }
                })
                .on('error', reject);
            })
            .on('error', (convErr) => {
              fsp.unlink(inputPath).catch(() => {});
              reject(convErr);
            })
            .run();
        });
      });
  });
}




const pincodeCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; 

const detectCountryByPincode = (pincode) => {
  const cleanPin = pincode.trim().toUpperCase();
  
  if (/^[0-9]{5}(-[0-9]{4})?$/.test(cleanPin)) {
    return 'US';
  }
  
  if (/^[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}$/i.test(cleanPin)) {
    return 'GB';
  }
  
  if (/^[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]$/i.test(cleanPin)) {
    return 'CA';
  }
  
  if (/^[0-9]{4}$/.test(cleanPin)) {
    return 'AU';
  }
  
  return null; 
};

exports.lookupPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    
    console.log('📍 Pincode lookup requested:', pincode);
    
    if (!pincode || !/^[A-Z0-9\s-]{3,10}$/i.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid postal code format.'
      });
    }

    const cleanPincode = pincode.trim().toUpperCase();

    const cached = pincodeCache.get(cleanPincode);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('✅ Returning cached result for:', cleanPincode);
      return res.json({
        success: true,
        data: cached.data,
        cached: true
      });
    }

    if (!process.env.GEONAMES_USERNAME) {
      console.error('❌ GEONAMES_USERNAME not configured');
      return res.status(500).json({
        success: false,
        message: 'Postal code lookup service not configured.'
      });
    }

    const countryCode = detectCountryByPincode(cleanPincode);
    console.log('🌍 Detected country code:', countryCode || 'GLOBAL SEARCH');

    console.log('🔍 Trying GeoNames API...');
    try {
      const geoParams = {
        postalcode: cleanPincode,
        username: process.env.GEONAMES_USERNAME,
        maxRows: 10
      };

      if (countryCode) {
        geoParams.country = countryCode;
      }

      const geoResponse = await axios.get(
        'https://secure.geonames.org/postalCodeLookupJSON',
        {
          params: geoParams,
          timeout: 10000
        }
      );

      console.log('📦 GeoNames response status:', geoResponse.status);
      console.log('📦 GeoNames data:', JSON.stringify(geoResponse.data, null, 2));

      if (geoResponse.data.status) {
        console.error('❌ GeoNames error:', geoResponse.data.status.message);
        throw new Error(geoResponse.data.status.message);
      }

      if (geoResponse.data && geoResponse.data.postalcodes && geoResponse.data.postalcodes.length > 0) {
        const results = geoResponse.data.postalcodes;
        
        const locations = results.map(result => ({
          pincode: result.postalCode || result.postalcode || cleanPincode,
          city: result.placeName || result.adminName2 || result.adminName3,
          state: result.adminName1,
          district: result.adminName2 || result.adminName3 || result.placeName,
          country: getCountryName(result.countryCode),
          countryCode: result.countryCode,
          latitude: result.lat,
          longitude: result.lng,
          adminName2: result.adminName2,
          adminName3: result.adminName3
        }));

        console.log(`✅ GeoNames found ${locations.length} location(s)`);

        const responseData = {
          multiple: locations.length > 1,
          locations: locations,
          pincode: locations[0].pincode,
          city: locations[0].city,
          state: locations[0].state,
          district: locations[0].district,
          country: locations[0].country,
          countryCode: locations[0].countryCode
        };

        pincodeCache.set(cleanPincode, {
          data: responseData,
          timestamp: Date.now()
        });

        return res.json({
          success: true,
          data: responseData,
          source: 'geonames'
        });
      } else {
        console.log('⚠️ GeoNames returned no results');
        throw new Error('No results from GeoNames');
      }

    } catch (geoError) {
      console.error('❌ GeoNames API error:', geoError.message);
      if (geoError.response) {
        console.error('API Response:', geoError.response.data);
      }
      
      if (/^[0-9]{6}$/.test(cleanPincode)) {
        console.log('🔄 Falling back to India Post API for 6-digit PIN...');
        
        try {
          const indiaPostResponse = await axios.get(
            `https://api.postalpincode.in/pincode/${cleanPincode}`,
            { timeout: 8000 }
          );

          console.log('📦 India Post response:', JSON.stringify(indiaPostResponse.data, null, 2));

          if (indiaPostResponse.data && 
              indiaPostResponse.data[0]?.Status === 'Success' && 
              indiaPostResponse.data[0]?.PostOffice?.length > 0) {
            
            const postOffices = indiaPostResponse.data[0].PostOffice;
            
            const locations = postOffices.map(po => ({
              pincode: cleanPincode,
              city: po.District,
              state: po.State,
              district: po.District,
              country: 'India',
              countryCode: 'IN',
              postOfficeName: po.Name,
              region: po.Region,
              division: po.Division,
              block: po.Block
            }));

            console.log(`✅ India Post found ${locations.length} location(s)`);

            const responseData = {
              multiple: locations.length > 1,
              locations: locations,
              pincode: locations[0].pincode,
              city: locations[0].city,
              state: locations[0].state,
              district: locations[0].district,
              country: locations[0].country,
              countryCode: locations[0].countryCode
            };

            pincodeCache.set(cleanPincode, {
              data: responseData,
              timestamp: Date.now()
            });

            return res.json({
              success: true,
              data: responseData,
              source: 'indiapost'
            });
          } else {
            console.log('❌ India Post also returned no results');
            return res.status(404).json({
              success: false,
              message: 'Postal code not found in our database.'
            });
          }

        } catch (indiaPostError) {
          console.error('❌ India Post API error:', indiaPostError.message);
          return res.status(500).json({
            success: false,
            message: 'Postal code lookup service temporarily unavailable.'
          });
        }
      } else {
        return res.status(404).json({
          success: false,
          message: 'Could not verify postal code. Please enter manually.'
        });
      }
    }

  } catch (error) {
    console.error('❌ Pincode lookup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to lookup postal code. Please try again.'
    });
  }
};

const getCountryName = (code) => {
  const countries = {
    'IN': 'India',
    'US': 'United States',
    'GB': 'United Kingdom',
    'CA': 'Canada',
    'AU': 'Australia',
    'RU': 'Russia',
    'DE': 'Germany',
    'FR': 'France',
    'IT': 'Italy',
    'ES': 'Spain',
    'BR': 'Brazil',
    'MX': 'Mexico',
    'JP': 'Japan',
    'CN': 'China',
    'KR': 'South Korea'
  };
  return countries[code] || code;
};

setInterval(() => {
  const now = Date.now();
  for (const [pincode, cached] of pincodeCache.entries()) {
    if (now - cached.timestamp > CACHE_DURATION) {
      pincodeCache.delete(pincode);
    }
  }
}, 60 * 60 * 1000);
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR' } = req.body;

    const options = {
      amount: amount * 100,
      currency,
      receipt: `receipt_${Date.now()}`
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency
      }
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, couponCode } = req.body;
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order items are required' 
      });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || 
        !shippingAddress.addressLine1 || !shippingAddress.city || 
        !shippingAddress.state || !shippingAddress.pincode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Complete shipping address is required' 
      });
    }

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cart is empty' 
      });
    }

    const cartItems = cart.items;
    let subtotal = 0;
    const orderItems = [];

    for (const item of cartItems) {
      const product = await Product.findById(item.product._id || item.product);
      
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: `Product not found` 
        });
      }

      if (product.status === 'archived') {
        return res.status(400).json({ 
          success: false, 
          message: `${product.name} is no longer available for order` 
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient stock for ${product.name}` 
        });
      }

      const itemTotal = product.sellingPrice * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        quantity: item.quantity,
        sellingPrice: product.sellingPrice,
        totalPrice: itemTotal,
        image: product.gallery?.[0]?.url || ''
      });

      product.stock -= item.quantity;
      await product.save();
    }

    const tax = Math.round(subtotal * 0.18);
    const shipping = subtotal >= 500 ? 0 : 50;
    let discount = 0;
    let appliedCouponCode = null;
    let referralDiscount = 0;

    const referralService = require('../services/referralService');
    const Referral = require('../models/referral');
    
    // Check if this user was referred (has a referral relationship)
    const referralRelationship = await Referral.findOne({
      referredUserId: userId,
      referralType: 'relationship'
    });

    // Calculate eligible subtotal using populated product data
    // We need to pass product objects, so build a temp array with product data
    const itemsWithProducts = [];
    for (const item of cartItems) {
      const product = await Product.findById(item.product._id || item.product);
      if (product) {
        itemsWithProducts.push({
          product,
          sellingPrice: product.sellingPrice,
          quantity: item.quantity
        });
      }
    }
    const eligibleSubtotal = referralService.calculateEligibleSubtotal(itemsWithProducts);

    if (referralRelationship && eligibleSubtotal >= 1000) {
      referralDiscount = referralService.getReferralTier(eligibleSubtotal);
      if (referralDiscount > 0) {
        console.log(`[Order] Applying referral discount: ₹${referralDiscount} (eligible subtotal: ₹${eligibleSubtotal})`);
      }
      
      // Mark the referral as 'qualified' now that they've placed a valid order
      // (The actual reward coupons will be generated when admin marks it as 'delivered')
      if (referralRelationship.status === 'joined') {
        referralRelationship.status = 'qualified';
        await referralRelationship.save();
      }
    }


    if (couponCode && referralDiscount === 0) {
      const Coupon = require('../models/coupon');
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      });

      if (coupon) {
        if (coupon.userId && coupon.userId.toString() !== userId) {
          return res.status(400).json({
            success: false,
            message: 'This coupon is not valid for your account'
          });
        }

        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          return res.status(400).json({
            success: false,
            message: 'Coupon usage limit reached'
          });
        }

        let effectiveSubtotal = subtotal;
        const isReferralCoupon = coupon.type === 'referral' || coupon.type === 'referral_reward' || !!coupon.referralId || !!coupon.referrerUserId || !!coupon.referredUserId || !!coupon.userId;
        if (isReferralCoupon) {
          effectiveSubtotal = 0;
          for (const item of cartItems) {
            const product = await Product.findById(item.product._id || item.product);
            if (product && product.referral_coupon_eligible !== false && product.referralCouponEligible !== false) {
              effectiveSubtotal += (item.sellingPrice || product.sellingPrice || 0) * (item.quantity || 1);
            }
          }

          if (effectiveSubtotal === 0) {
            return res.status(400).json({
              success: false,
              message: 'None of the items in your cart are eligible for this referral coupon'
            });
          }
        }

        if (effectiveSubtotal < coupon.minPurchase) {
          return res.status(400).json({
            success: false,
            message: `Minimum order of ₹${coupon.minPurchase} required on eligible products`
          });
        }

        if (coupon.discountType === 'percentage') {
          discount = Math.round((effectiveSubtotal * coupon.discountValue) / 100);
          if (coupon.maxDiscount) {
            discount = Math.min(discount, coupon.maxDiscount);
          }
        } else {
          discount = coupon.discountValue;
        }
        discount = Math.min(discount, effectiveSubtotal);
        appliedCouponCode = coupon.code;

        coupon.usedCount += 1;
        coupon.usedBy.push({
          user: userId,
          usedAt: new Date()
        });
        await coupon.save();
      }
    } else if (referralDiscount > 0) {
      discount = referralDiscount;
    }

    const total = subtotal + tax + shipping - discount;

    const orderNumber = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const order = await Order.create({
      user: userId,
      orderNumber,
      items: orderItems,
      shippingAddress,
      paymentMethod,
      subtotal,
      tax,
      shipping,
      shippingCost: shipping,
      discount,
      total,
      totalAmount: total,
      couponCode: appliedCouponCode,
      referralDiscount: referralDiscount > 0 ? referralDiscount : undefined,
      status: 'pending',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid'
    });

    // Referral reward generation happens ONLY when the order is marked 'delivered'
    // It was removed from here to prevent premature coupon generation.

    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [] } }
    );

    res.status(201).json({
      success: true,
      data: { order },
      message: 'Order created successfully'
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('items.product', 'name gallery'),
      Order.countDocuments({ user: req.user.id })
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalOrders: total
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate('user', 'username email contactNumber')
      .populate('items.product', 'name gallery');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.user._id.toString() !== req.user.id && req.user.role === 'user') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
};

exports.requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    if (order.returnRequest && order.returnRequest.requested) {
      return res.status(400).json({ success: false, message: 'A replacement request already exists for this order' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required for the replacement request' });
    }

    const deliveryDate = new Date(order.deliveredAt);
    const daysSinceDelivery = Math.floor((Date.now() - deliveryDate) / (1000 * 60 * 60 * 24));

    if (daysSinceDelivery > 3) {
      return res.status(400).json({ success: false, message: 'Replacement window expired (3 days)' });
    }

    // Images are uploaded to ImageKit on the client and passed as URLs (max 5)
    let images = [];
    if (req.body.images) {
      try {
        const parsed = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
        if (Array.isArray(parsed)) {
          images = parsed
            .filter(img => img && img.url)
            .map(img => ({ url: img.url, fileId: img.fileId || '' }));
        }
      } catch (parseErr) {
        return res.status(400).json({ success: false, message: 'Invalid images format' });
      }
    }

    if (images.length > 5) {
      return res.status(400).json({ success: false, message: 'Maximum 5 photos allowed' });
    }

    // Only one video is allowed, uploaded to the server and transcoded (max 30s)
    let videos = [];
    if (req.files && req.files.videos) {
      const videoFiles = Array.isArray(req.files.videos) ? req.files.videos : [req.files.videos];

      if (videoFiles.length > 1) {
        return res.status(400).json({ success: false, message: 'Only 1 video is allowed' });
      }

      try {
        videos = await Promise.all(videoFiles.map(file => processReturnVideo(file)));
      } catch (videoErr) {
        return res.status(400).json({ success: false, message: videoErr.message || 'Failed to process video' });
      }
    }

    order.returnRequest = {
      requested: true,
      requestedAt: new Date(),
      reason,
      images,
      videos,
      status: 'pending'
    };

    await order.save();

    res.json({ success: true, message: 'Replacement request submitted', data: order });
  } catch (error) {
    console.error('Request return error:', error);
    res.status(500).json({ success: false, message: 'Failed to request replacement' });
  }
};

// Customer submits their UPI id for a COD refund after the request is approved.
exports.submitReturnUpi = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { upiId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.paymentMethod !== 'cod') {
      return res.status(400).json({ success: false, message: 'UPI refund applies to COD orders only' });
    }

    if (!order.returnRequest || !order.returnRequest.requested) {
      return res.status(400).json({ success: false, message: 'No replacement request found' });
    }

    const allowedStatuses = ['approved', 'pickup_scheduled', 'picked_up', 'refund_pending'];
    if (!allowedStatuses.includes(order.returnRequest.status)) {
      return res.status(400).json({ success: false, message: 'UPI id can only be submitted after the request is approved' });
    }

    if (order.returnRequest.status === 'refunded') {
      return res.status(400).json({ success: false, message: 'This order has already been refunded' });
    }

    if (!upiId || !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
      return res.status(400).json({ success: false, message: 'Invalid UPI id' });
    }

    order.returnRequest.refundUpiId = upiId.trim();
    order.returnRequest.status = 'refund_pending';
    await order.save();

    res.json({ success: true, message: 'UPI id submitted successfully' });
  } catch (error) {
    console.error('Submit return UPI error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit UPI id' });
  }
};


exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = req.query;

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'username email contactNumber')
        .populate('items.product', 'name gallery')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Order.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalOrders: total
        }
      }
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, shippingProvider } = req.body;

    const order = await Order.findById(id).populate('user', 'contactNumber username').populate('items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const updateData = { status };

    if (status === 'shipped') {
      updateData.shippedAt = new Date();
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (shippingProvider) updateData.shippingProvider = shippingProvider;
    } else if (status === 'delivered') {
      updateData.deliveredAt = new Date();

      try {
        const Notification = require('../models/notification');
        const referralServiceLib = require('../services/referralService');
        const Referral = require('../models/referral');

        // Notify the customer that their order was delivered
        await Notification.create({
          user: order.user._id,
          type: 'order',
          title: `✅ Order #${order.orderNumber} Delivered!`,
          message: `Your order has been delivered. Thank you for shopping with us! You can write a review from your orders page.`,
          read: false,
          actionUrl: `/orders/${order._id}`,
          data: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            deliveredAt: new Date().toISOString()
          }
        });

        // Process referral reward: find the relationship to get referrerId
        const userIdForReferral = (order.user && order.user._id) ? order.user._id : order.user;
        
        const referralRelationship = await Referral.findOne({
          referredUserId: userIdForReferral,
          referralType: 'relationship'
        });

        console.log(`[Order Delivered] Checking referral for user ${userIdForReferral}. Found: ${!!referralRelationship}`);

        if (referralRelationship) {
          if (!referralRelationship.qualifyingOrderId) {
            // Build itemsWithProducts array for eligible subtotal calculation
            const itemsWithProducts = order.items.map(item => ({
              product: item.product,
              sellingPrice: item.sellingPrice,
              price: item.price || item.sellingPrice,
              quantity: item.quantity
            }));

            const eligibleSubtotal = referralServiceLib.calculateEligibleSubtotal(itemsWithProducts);
            console.log(`[Order Delivered] Eligible subtotal for referral: ₹${eligibleSubtotal}`);

            if (eligibleSubtotal >= 1000) {
              const { processReferralOnOrder } = require('./referralController');
              console.log(`[Order Delivered] Calling processReferralOnOrder...`);
              await processReferralOnOrder(order._id, userIdForReferral, itemsWithProducts);
              console.log(`[Order Delivered] processReferralOnOrder completed.`);
            } else {
              console.log(`[Order Delivered] Subtotal < 1000, skipping reward.`);
            }
          } else {
             console.log(`[Order Delivered] Referral already processed for order: ${referralRelationship.qualifyingOrderId}`);
          }
        }
      } catch (referralErr) {
        console.error('[UpdateStatus] Referral processing error (non-fatal):', referralErr);
      }
    }

    await Order.findByIdAndUpdate(id, updateData);

    res.json({ success: true, message: 'Order status updated' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
};

exports.handleReturnRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      action,
      adminNotes,
      trackingNumber,
      provider,
      replacementTrackingNumber,
      refundTransactionId
    } = req.body;

    const order = await Order.findById(id).populate('user', 'contactNumber').populate('items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.returnRequest || !order.returnRequest.requested) {
      return res.status(400).json({ success: false, message: 'No replacement request found' });
    }

    const rr = order.returnRequest;
    if (adminNotes) rr.adminNotes = adminNotes;

    switch (action) {
      case 'approve': {
        if (rr.status !== 'pending') {
          return res.status(400).json({ success: false, message: 'Only pending requests can be approved' });
        }
        rr.status = 'approved';
        rr.approvedAt = new Date();

        // Auto-create a Shiprocket return pickup (customer address -> warehouse).
        if (shiprocketService.isConfigured()) {
          try {
            const result = await shiprocketService.createReturnOrder(order);
            rr.pickup = rr.pickup || {};
            rr.pickup.scheduled = true;
            rr.pickup.scheduledAt = new Date();
            rr.pickup.provider = 'Shiprocket';
            rr.pickup.shiprocketReturnOrderId = result.returnOrderId ? String(result.returnOrderId) : undefined;
            rr.pickup.shiprocketShipmentId = result.shipmentId ? String(result.shipmentId) : undefined;
            rr.status = 'pickup_scheduled';
          } catch (pickupErr) {
            // Non-fatal: approval still succeeds, admin can schedule pickup manually.
            console.error('Shiprocket return pickup error:', pickupErr.response?.data || pickupErr.message);
          }
        }
        break;
      }

      case 'reject': {
        if (rr.status !== 'pending') {
          return res.status(400).json({ success: false, message: 'Only pending requests can be rejected' });
        }
        rr.status = 'rejected';
        rr.rejectedAt = new Date();
        break;
      }

      case 'schedule_pickup': {
        if (!['approved', 'refund_pending'].includes(rr.status)) {
          return res.status(400).json({ success: false, message: 'Request must be approved before scheduling pickup' });
        }
        rr.pickup = rr.pickup || {};
        rr.pickup.scheduled = true;
        rr.pickup.scheduledAt = new Date();
        if (trackingNumber) rr.pickup.trackingNumber = trackingNumber;
        if (provider) rr.pickup.provider = provider;
        if (rr.status === 'approved') rr.status = 'pickup_scheduled';
        break;
      }

      case 'mark_picked_up': {
        if (!rr.pickup || !rr.pickup.scheduled) {
          return res.status(400).json({ success: false, message: 'Pickup must be scheduled first' });
        }
        rr.pickup.pickedUp = true;
        rr.pickup.pickedUpAt = new Date();
        if (rr.status === 'pickup_scheduled') rr.status = 'picked_up';
        break;
      }

      case 'ship_replacement': {
        if (!['approved', 'pickup_scheduled', 'picked_up'].includes(rr.status)) {
          return res.status(400).json({ success: false, message: 'Request must be approved before shipping a replacement' });
        }
        rr.replacementItemOutOfStock = false;
        rr.replacementShippedAt = new Date();
        if (replacementTrackingNumber) rr.replacementTrackingNumber = replacementTrackingNumber;
        rr.status = 'replacement_shipped';
        break;
      }

      case 'refund': {
        if (rr.status === 'refunded') {
          return res.status(400).json({ success: false, message: 'This order has already been refunded' });
        }
        if (['pending', 'rejected'].includes(rr.status)) {
          return res.status(400).json({ success: false, message: 'Request must be approved before refunding' });
        }

        const amount = order.totalAmount;
        rr.replacementItemOutOfStock = true;
        rr.refundAmount = amount;
        rr.refundInitiatedAt = new Date();

        if (order.paymentMethod === 'razorpay') {
          if (!order.razorpayPaymentId) {
            return res.status(400).json({ success: false, message: 'No Razorpay payment found for this order' });
          }
          // Persist the idempotency key before calling the gateway so a retry reuses it.
          if (!rr.refundIdempotencyKey) {
            rr.refundIdempotencyKey = uuidv4();
            await order.save();
          }
          let refund;
          try {
            refund = await razorpayIdempotent.refundPayment(
              order.razorpayPaymentId,
              {
                amount: Math.round(amount * 100),
                speed: 'normal',
                notes: { orderNumber: order.orderNumber, reason: 'Replacement out of stock' }
              },
              rr.refundIdempotencyKey
            );
          } catch (refundErr) {
            console.error('Razorpay refund error:', refundErr.response?.data || refundErr.message);
            return res.status(502).json({ success: false, message: 'Razorpay refund failed', error: refundErr.message });
          }
          rr.refundMethod = 'razorpay';
          rr.refundTransactionId = refund.id;
        } else {
          // COD: customer must have provided a UPI id, admin pays manually
          if (!rr.refundUpiId) {
            return res.status(400).json({ success: false, message: 'Customer has not provided a UPI id yet' });
          }
          if (!refundTransactionId || !refundTransactionId.trim()) {
            return res.status(400).json({ success: false, message: 'refundTransactionId (payment reference) is required for COD refunds' });
          }
          rr.refundMethod = 'upi';
          rr.refundTransactionId = refundTransactionId.trim();
        }

        rr.refundedAt = new Date();
        rr.status = 'refunded';
        order.paymentStatus = 'refunded';
        order.status = 'returned';
        break;
      }

      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    await order.save();

    res.json({ success: true, message: `Replacement request updated (${action})`, data: order });
  } catch (error) {
    console.error('Handle return request error:', error);
    res.status(500).json({ success: false, message: 'Failed to handle replacement request' });
  }
};

exports.downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findById(id)
      .populate('user', 'username email contactNumber')
      .populate('items.product', 'name sku');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.user._id.toString() !== req.user.id && req.user.role !== 'super-admin' && req.user.role !== 'content-admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${order.orderNumber}.pdf`);

    doc.pipe(res);

    const primaryColor = '#8b0000';
    const textColor = '#2d3748';
    const lightGray = '#718096';

    doc.fontSize(28).fillColor(primaryColor).text('INVOICE', 50, 50, { align: 'left' });
    doc.fontSize(10).fillColor(lightGray).text(`Invoice #${order.orderNumber}`, 50, 85);

    doc.fontSize(12).fillColor(textColor).text('Your Company Name', 400, 50, { align: 'right' });
    doc.fontSize(9).fillColor(lightGray)
       .text('123 Business Street', 400, 70, { align: 'right' })
       .text('City, State 123456', 400, 85, { align: 'right' })
       .text('Email: info@company.com', 400, 100, { align: 'right' })
       .text('Phone: +91 1234567890', 400, 115, { align: 'right' });

    doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#e2e8f0').lineWidth(2).stroke();

    doc.fontSize(10).fillColor(lightGray).text('Order Date:', 50, 160)
       .fillColor(textColor).text(new Date(order.createdAt).toLocaleDateString('en-IN'), 120, 160);

    doc.fillColor(lightGray).text('Payment:', 50, 180)
       .fillColor(textColor).text(order.paymentMethod.toUpperCase(), 150, 180);

    doc.fontSize(12).fillColor(primaryColor).text('BILL TO:', 50, 240);
    doc.fontSize(10).fillColor(textColor).text(order.shippingAddress.fullName, 50, 260)
       .fillColor(lightGray).text(order.shippingAddress.addressLine1, 50, 275);

    if (order.shippingAddress.addressLine2) {
      doc.text(order.shippingAddress.addressLine2, 50, 290);
      doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`, 50, 305);
      doc.text(`Phone: ${order.shippingAddress.phone}`, 50, 320);
    } else {
      doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`, 50, 290);
      doc.text(`Phone: ${order.shippingAddress.phone}`, 50, 305);
    }

    const tableTop = 360;
    doc.rect(50, tableTop, 495, 25).fill(primaryColor);
    doc.fillColor('#fff')
       .text('Item', 60, tableTop + 8)
       .text('Qty', 320, tableTop + 8)
       .text('Price', 380, tableTop + 8)
       .text('Total', 480, tableTop + 8);

    let yPosition = tableTop + 35;
    doc.fillColor(textColor).fontSize(9);

    order.items.forEach((item, index) => {
      const itemName = item.name || item.product?.name || 'Product';
      const bgColor = index % 2 === 0 ? '#f7fafc' : '#ffffff';
      
      doc.rect(50, yPosition - 5, 495, 25).fill(bgColor);
      doc.fillColor(textColor)
         .text(itemName, 60, yPosition, { width: 240, ellipsis: true })
         .text(item.quantity.toString(), 325, yPosition)
         .text(`₹${item.sellingPrice.toFixed(2)}`, 370, yPosition)
         .text(`₹${item.totalPrice.toFixed(2)}`, 470, yPosition);
      
      yPosition += 30;
    });

    yPosition += 20;
    doc.moveTo(350, yPosition).lineTo(545, yPosition).strokeColor('#e2e8f0').lineWidth(1).stroke();
    yPosition += 15;

    doc.fontSize(10).fillColor(lightGray);
    doc.text('Subtotal:', 370, yPosition).fillColor(textColor).text(`₹${order.subtotal.toFixed(2)}`, 480, yPosition, { align: 'right' });
    yPosition += 20;

    doc.fillColor(lightGray).text('Tax (18%):', 370, yPosition).fillColor(textColor).text(`₹${order.tax.toFixed(2)}`, 480, yPosition, { align: 'right' });
    yPosition += 20;

    doc.fillColor(lightGray).text('Shipping:', 370, yPosition).fillColor(textColor).text(`₹${(order.shipping || order.shippingCost || 0).toFixed(2)}`, 480, yPosition, { align: 'right' });
    yPosition += 20;

    if (order.discount > 0) {
      doc.fillColor(lightGray).text('Discount:', 370, yPosition).fillColor('#38a169').text(`-₹${order.discount.toFixed(2)}`, 480, yPosition, { align: 'right' });
      yPosition += 20;
    }

    doc.moveTo(350, yPosition).lineTo(545, yPosition).strokeColor(primaryColor).lineWidth(2).stroke();
    yPosition += 15;

    doc.fontSize(14).fillColor(primaryColor).text('TOTAL:', 370, yPosition)
       .text(`₹${(order.total || order.totalAmount).toFixed(2)}`, 480, yPosition, { align: 'right' });

    const footerY = doc.page.height - 80;
    doc.moveTo(50, footerY - 20).lineTo(545, footerY - 20).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.fontSize(9).fillColor(lightGray).text('Thank you for your business!', 50, footerY, { align: 'center', width: 495 });

    doc.end();

  } catch (error) {
    console.error('Download invoice error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
  }
};