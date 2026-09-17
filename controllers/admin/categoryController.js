const Category = require('../../models/category');
const SubCategory = require('../../models/subCategory');
const Product = require('../../models/product');
const redisManager = require('../../config/redis');
const ImageKit = require('imagekit');

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});



exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id).populate('createdBy', 'username email');

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category' });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;

const cacheKey = `categories:v2:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [categories, total] = await Promise.all([
      Category.find(query)
        .populate('createdBy', 'username email')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Category.countDocuments(query)
    ]);

    
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const [productCount, subCategoryCount] = await Promise.all([
          Product.countDocuments({ category: category._id }),
          SubCategory.countDocuments({ category: category._id })
        ]);
        return { ...category, productCount, subCategoryCount };
      })
    );

    const result = {
      categories: categoriesWithCounts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalCategories: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    
    const category = new Category({
      name,
      description,
      status,
      createdBy: req.user.id
    });
    
    await category.save();
    
    
   await redisManager.delPattern('products:*');
await redisManager.delPattern('categories:*');
    await redisManager.delPattern('nav:*');
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create category' 
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    
    const category = await Category.findByIdAndUpdate(
      id,
      { name, description, status, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    
await redisManager.delPattern('products:*');
    await redisManager.delPattern('categories:*');
    await redisManager.delPattern('nav:*');
    
    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    
    const productCount = await Product.countDocuments({ category: id });
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete category. It has ${productCount} products.` 
      });
    }
    
    
    const subCategoryCount = await SubCategory.countDocuments({ category: id });
    if (subCategoryCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete category. It has ${subCategoryCount} subcategories.` 
      });
    }
    
    await Category.findByIdAndDelete(id);
    
  await redisManager.delPattern('products:*');
    await redisManager.delPattern('categories:*');
    await redisManager.delPattern('nav:*');
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};


