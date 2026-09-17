const express = require('express');
const router = express.Router();
const WishlistController = require('../controllers/wishlistController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, WishlistController.getWishlist);
router.post('/add', protect, WishlistController.addToWishlist);
router.delete('/item/:itemId', protect, WishlistController.removeFromWishlist);
router.delete('/clear', protect, WishlistController.clearWishlist);

module.exports = router;