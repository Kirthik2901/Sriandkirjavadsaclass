const express = require('express');
const router = express.Router();
const SubSubCategoryController = require('../../controllers/admin/subsubCategoryController');
const { protect, admin, systemAdmin } = require('../../middlewares/authMiddleware');

router.get('/', SubSubCategoryController.getAllSubSubCategories);
router.get('/subcategory/:subCategoryId', SubSubCategoryController.getSubSubCategoriesBySubCategory);
router.get('/:id', SubSubCategoryController.getSubSubCategoryById);

router.post('/', protect, admin, SubSubCategoryController.createSubSubCategory);
router.put('/:id', protect, admin, SubSubCategoryController.updateSubSubCategory);
router.delete('/:id', protect, systemAdmin, SubSubCategoryController.deleteSubSubCategory);

module.exports = router;