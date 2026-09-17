const Wishlist = require('../models/wishlist');
const Product = require('../models/product');


exports.getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id })
      .populate('items.product', 'name sellingPrice originalPrice gallery stock status');

    if (!wishlist) {
      return res.json({
        success: true,
        data: { items: [] }
      });
    }

    res.json({ success: true, data: wishlist });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wishlist' });
  }
};


exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.status === 'archived') {
      return res.status(400).json({ success: false, message: 'This product is no longer available' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user.id, items: [] });
    }

    
    const exists = wishlist.items.some(item => item.product.toString() === productId);
    if (exists) {
      return res.status(400).json({ success: false, message: 'Product already in wishlist' });
    }

    wishlist.items.push({ product: productId });
    await wishlist.save();
    await wishlist.populate('items.product', 'name sellingPrice originalPrice gallery stock status');

    res.json({ success: true, message: 'Added to wishlist', data: wishlist });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
  }
};


exports.removeFromWishlist = async (req, res) => {
  try {
    const { itemId } = req.params;

    const wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: 'Wishlist not found' });
    }

    wishlist.items.pull(itemId);
    await wishlist.save();
    await wishlist.populate('items.product', 'name sellingPrice originalPrice gallery stock status');

    res.json({ success: true, message: 'Removed from wishlist', data: wishlist });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from wishlist' });
  }
};


exports.clearWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user.id },
      { items: [] },
      { new: true }
    );

    res.json({ success: true, message: 'Wishlist cleared', data: wishlist });
  } catch (error) {
    console.error('Clear wishlist error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear wishlist' });
  }
};