const express = require('express');
const router = express.Router();
const BlogController = require('../../controllers/admin/blogControllers');
const { protect, admin, systemAdmin } = require('../../middlewares/authMiddleware');

router.get('/', BlogController.getAllBlogs);
router.get('/:id', BlogController.getBlogById);

router.post('/', protect, admin, BlogController.createBlog);
router.put('/:id', protect, admin, BlogController.updateBlog);
router.delete('/:id', protect, systemAdmin, BlogController.deleteBlog);

module.exports = router;