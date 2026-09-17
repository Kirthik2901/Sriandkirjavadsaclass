const express = require('express');
const router = express.Router();
const subcategoryController = require('../controllers/subCategoryController');


router.get('/', subcategoryController.getAllSubCategories);

module.exports = router;