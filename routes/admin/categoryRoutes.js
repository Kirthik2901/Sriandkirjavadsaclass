const express = require('express');
const router = express.Router();
const CategoryController = require('../../controllers/admin/categoryController');
const { protect, admin, systemAdmin } = require('../../middlewares/authMiddleware');

router.get('/', CategoryController.getAllCategories);
router.get('/:id', CategoryController.getCategoryById);

router.post('/', protect, admin, CategoryController.createCategory);
router.put('/:id', protect, admin, CategoryController.updateCategory);
router.delete('/:id', protect, systemAdmin, CategoryController.deleteCategory);

module.exports = router;