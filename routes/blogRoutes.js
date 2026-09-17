const express = require('express');
const router = express.Router();
const BlogController = require('../controllers/admin/blogControllers');


router.get('/', BlogController.getAllBlogs);
router.get('/slug/:slug', BlogController.getBlogBySlug);

module.exports = router;