const Cart = require('../models/cart');
const Product = require('../models/product');


exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', 'name slug sellingPrice gallery featuredImage stock status referral_coupon_eligible');

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    
    cart.items = cart.items.filter(item => item.product && item.product._id);
    
    
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cart.items.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);

    res.json({ 
      success: true, 
      data: {
        _id: cart._id,
        user: cart.user,
        items: cart.items,
        totalItems,
        totalAmount
      }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cart' });
  }
};


exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, options, price } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.status === 'archived') {
      return res.status(400).json({ success: false, message: 'This product is no longer available' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    const variantStr = options ? JSON.stringify(options) : null;

    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.variant === variantStr
    );

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
      // Update price if it changed (e.g. they added another kid with different price)
      if (price) {
        cart.items[existingItemIndex].sellingPrice = price;
      }
    } else {
      cart.items.push({
        product: productId,
        quantity,
        variant: variantStr,
        sellingPrice: price || product.sellingPrice
      });
    }

    await cart.save();
    await cart.populate('items.product', 'name slug sellingPrice gallery featuredImage stock status referral_coupon_eligible');

    res.json({ success: true, message: 'Item added to cart', data: cart });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to add item to cart' });
  }
};


exports.updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity, options, price } = req.body;

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    const product = await Product.findById(item.product);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (product.status === 'archived') {
      return res.status(400).json({ success: false, message: 'This product is no longer available' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    item.quantity = quantity;
    if (options) {
      item.variant = JSON.stringify(options);
    }
    if (price) {
      item.sellingPrice = price;
    }
    
    await cart.save();
    await cart.populate('items.product', 'name slug sellingPrice gallery featuredImage stock status referral_coupon_eligible');

    res.json({ success: true, message: 'Cart updated', data: cart });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
};


exports.removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items.pull(itemId);
    await cart.save();
    await cart.populate('items.product', 'name slug sellingPrice gallery stock status');

    res.json({ success: true, message: 'Item removed from cart', data: cart });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove item' });
  }
};


exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { user: req.user.id },
      { items: [] },
      { new: true }
    );

    res.json({ success: true, message: 'Cart cleared', data: cart });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
};