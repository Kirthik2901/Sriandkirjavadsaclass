const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/admin/productController');
const { protect } = require('../middlewares/authMiddleware');
const fileUpload = require('../utils/fileUpload');

const upload = fileUpload.getMulterConfig();


router.get('/', ProductController.getAllProducts);


router.get('/new-arrivals', ProductController.getNewArrivals);
router.get('/categories-nav', ProductController.getCategoriesForNav);
router.get('/search', ProductController.searchProducts);


router.get('/similar/:categoryId', ProductController.getProductsByCategoryId);

router.get('/category/:categorySlug/:subCategorySlug/:subSubCategorySlug', ProductController.getProductsBySubSubCategorySlug);
router.get('/category/:categorySlug/:subCategorySlug', ProductController.getProductsBySubCategorySlug);
router.get('/category/:categorySlug', ProductController.getProductsByCategorySlug);


router.get('/tag/:tagId', ProductController.getProductsByTag);


router.post(
  '/:productId/review', 
  protect, 
  upload.fields([
    { name: 'videos', maxCount: 5 }
  ]), 
  ProductController.addReview
);


router.get('/:productSlug', ProductController.getProductBySlug);

module.exports = router;