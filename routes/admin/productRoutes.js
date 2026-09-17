
const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { protect, admin, superAdmin, systemAdmin } = require('../../middlewares/authMiddleware');
const fileUpload = require('../../utils/fileUpload');
const { 
  validateProductData, 
  autoGenerateUniqueSku 
} = require('../../middlewares/handleValidation');

const upload = fileUpload.getMulterConfig();


router.use(protect);
router.use(admin);


router.get('/', ProductController.getAllProducts);
router.get('/:id', ProductController.getProductById);


router.post('/', 
  upload.fields([
    { name: 'images', maxCount: 50 },
    { name: 'videos', maxCount: 20 }
  ]),
  validateProductData,        
  autoGenerateUniqueSku,      
  ProductController.createProduct
);


router.put('/:id', 
  upload.fields([
    { name: 'images', maxCount: 50 },
    { name: 'videos', maxCount: 20 }
  ]),
  validateProductData,        
  autoGenerateUniqueSku,      
  ProductController.updateProduct
);


router.patch('/:id/archive', superAdmin, ProductController.archiveProduct);

router.delete('/:id', systemAdmin, ProductController.deleteProduct);

module.exports = router;