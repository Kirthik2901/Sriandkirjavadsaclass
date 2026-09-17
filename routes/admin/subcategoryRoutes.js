const express = require('express');
const router = express.Router();
const SubCategoryController = require('../../controllers/admin/subcategoryController');
const { protect, admin, systemAdmin } = require('../../middlewares/authMiddleware');

router.get('/', SubCategoryController.getAllSubCategories);
router.get('/category/:categoryId', SubCategoryController.getSubCategoriesByCategory);
router.get('/:id', SubCategoryController.getSubCategoryById);

router.post('/', protect, admin, SubCategoryController.createSubCategory);
router.put('/:id', protect, admin, SubCategoryController.updateSubCategory);
router.delete('/:id', protect, systemAdmin, SubCategoryController.deleteSubCategory);

module.exports = router;