const Order = require('../models/order');
const Cart = require('../models/cart');
const Product = require('../models/product');
const User = require('../models/user');

exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, couponCode } = req.body;
    const userId = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items in order' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: `Product not found` 
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
        slug: product.slug, 
        image: product.gallery[0]?.url || '',
        quantity: item.quantity,
        sellingPrice: product.sellingPrice,
        totalPrice: itemTotal,
        reviewed: false
      });

      product.stock -= item.quantity;
      product.totalSold = (product.totalSold || 0) + item.quantity;
      await product.save();
    }

    
    const tax = Math.round(subtotal * 0.18);
    const shippingCost = subtotal >= 500 ? 0 : 50;
    let discount = 0;

    if (couponCode) {
      const Coupon = require('../models/coupon');
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      });

      if (coupon && subtotal >= coupon.minPurchase) {
        if (coupon.discountType === 'percentage') {
          discount = Math.round((subtotal * coupon.discountValue) / 100);
          if (coupon.maxDiscount) {
            discount = Math.min(discount, coupon.maxDiscount);
          }
        } else {
          discount = coupon.discountValue;
        }
        discount = Math.min(discount, subtotal);
        
        coupon.usedCount += 1;
        await coupon.save();
      }
    }

    const totalAmount = subtotal + tax + shippingCost - discount;
    const orderNumber = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const order = await Order.create({
      user: userId,
      orderNumber,
      items: orderItems,
      shippingAddress,
      paymentMethod,
      subtotal,
      tax,
      shippingCost,
      discount,
      totalAmount,
      couponCode: couponCode || null,
      status: 'pending',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending'
    });

    
    await mongoose.model('Cart').findOneAndUpdate(
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
      message: 'Failed to create order' 
    });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find({ user: req.user.id })
        .populate({
          path: 'items.product',
          select: 'name slug gallery price stock status'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
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
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    
    if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
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

    
    const deliveryDate = new Date(order.deliveredAt);
    const daysSinceDelivery = Math.floor((Date.now() - deliveryDate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceDelivery > 7) {
      return res.status(400).json({ success: false, message: 'Return window expired (7 days)' });
    }

    order.returnRequest = {
      requested: true,
      requestedAt: new Date(),
      reason,
      status: 'pending'
    };

    await order.save();

    res.json({ success: true, message: 'Return request submitted', data: order });
  } catch (error) {
    console.error('Request return error:', error);
    res.status(500).json({ success: false, message: 'Failed to request return' });
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
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
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

    const order = await Order.findById(id).populate('user', 'contactNumber');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const updateData = { status };

    if (status === 'confirmed') {
      updateData.confirmedAt = new Date();
    } else if (status === 'shipped') {
      updateData.shippedAt = new Date();
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (shippingProvider) updateData.shippingProvider = shippingProvider;
    } else if (status === 'delivered') {
      updateData.deliveredAt = new Date();
      updateData.paymentStatus = 'paid';
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
    const { action, refundAmount } = req.body;

    const order = await Order.findById(id).populate('user', 'contactNumber email');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.returnRequest.requested) {
      return res.status(400).json({ success: false, message: 'No return request found' });
    }

    if (action === 'approve') {
      order.returnRequest.status = 'approved';
      order.returnRequest.approvedAt = new Date();
      order.returnRequest.refundAmount = refundAmount || order.totalAmount;
      order.status = 'returned';
      order.paymentStatus = 'refunded';

    } else if (action === 'reject') {
      order.returnRequest.status = 'rejected';
      order.returnRequest.rejectedAt = new Date();
    }

    await order.save();

    res.json({ success: true, message: `Return request ${action}d` });
  } catch (error) {
    console.error('Handle return request error:', error);
    res.status(500).json({ success: false, message: 'Failed to handle return request' });
  }
};