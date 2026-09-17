const express = require('express');
const router = express.Router();
const CartController = require('../controllers/cartController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, CartController.getCart);
router.post('/add', protect, CartController.addToCart);
router.put('/item/:itemId', protect, CartController.updateCartItem);
router.delete('/item/:itemId', protect, CartController.removeFromCart);
router.delete('/clear', protect, CartController.clearCart);

module.exports = router;