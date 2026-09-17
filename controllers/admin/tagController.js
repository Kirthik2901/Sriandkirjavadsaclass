const Tag = require('../../models/tag');
const Product = require('../../models/product');
const redisManager = require('../../config/redis');

class TagController {
  

static async getAllTags(req, res) {
  try {
    console.log('Get all tags request:', req.query);
    
    const { page = 1, limit = 50, search = '', isActive } = req.query;

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    console.log('Tag query:', query);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [tags, total] = await Promise.all([
      Tag.find(query)
        .populate('createdBy', 'username email')
        .sort({ displayOrder: 1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Tag.countDocuments(query)
    ]);

    console.log(`Found ${tags.length} tags out of ${total} total`);

    
    const tagsWithCount = await Promise.all(
      tags.map(async (tag) => {
        const productCount = await Product.countDocuments({ 
          tags: tag._id, 
          status: 'active' 
        });
        return { ...tag, productCount };
      })
    );

    const result = {
      tags: tagsWithCount,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalTags: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    
    try {
      await redisManager.set(`tags:${JSON.stringify(req.query)}`, result, 600);
    } catch (cacheError) {
      console.error('Redis cache error:', cacheError);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tags',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

  
  static async getTagById(req, res) {
    try {
      const { id } = req.params;
      const tag = await Tag.findById(id).populate('createdBy', 'username email');

      if (!tag) {
        return res.status(404).json({ success: false, message: 'Tag not found' });
      }

      const productCount = await Product.countDocuments({ 
        tags: id, 
        status: 'active' 
      });

      res.json({ 
        success: true, 
        data: { ...tag.toObject(), productCount } 
      });
    } catch (error) {
      console.error('Get tag error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tag' });
    }
  }

  
  static async createTag(req, res) {
    try {
      const { name, description, color, icon, displayOrder, isActive } = req.body;

      const existingTag = await Tag.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
      if (existingTag) {
        return res.status(400).json({
          success: false,
          message: 'Tag with this name already exists'
        });
      }

      const tag = new Tag({
        name,
        description,
        color,
        icon,
        displayOrder,
        isActive,
        createdBy: req.user.id
      });

      await tag.save();
      await tag.populate('createdBy', 'username email');

      await redisManager.delPattern('tags:*');

      res.status(201).json({
        success: true,
        message: 'Tag created successfully',
        data: tag
      });
    } catch (error) {
      console.error('Create tag error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create tag'
      });
    }
  }

  
  static async updateTag(req, res) {
    try {
      const { id } = req.params;
      const { name, description, color, icon, displayOrder, isActive } = req.body;

      const existingTag = await Tag.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });

      if (existingTag) {
        return res.status(400).json({
          success: false,
          message: 'Tag with this name already exists'
        });
      }

      const tag = await Tag.findByIdAndUpdate(
        id,
        { name, description, color, icon, displayOrder, isActive },
        { new: true, runValidators: true }
      ).populate('createdBy', 'username email');

      if (!tag) {
        return res.status(404).json({ success: false, message: 'Tag not found' });
      }

      await redisManager.delPattern('tags:*');
      await redisManager.delPattern('products:*');

      res.json({
        success: true,
        message: 'Tag updated successfully',
        data: tag
      });
    } catch (error) {
      console.error('Update tag error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update tag'
      });
    }
  }

  
  static async deleteTag(req, res) {
    try {
      const { id } = req.params;

      
      const productCount = await Product.countDocuments({ tags: id });
      if (productCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete tag. It is currently used by ${productCount} product(s)`
        });
      }

      const tag = await Tag.findByIdAndDelete(id);
      if (!tag) {
        return res.status(404).json({ success: false, message: 'Tag not found' });
      }

      await redisManager.delPattern('tags:*');

      res.json({ success: true, message: 'Tag deleted successfully' });
    } catch (error) {
      console.error('Delete tag error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete tag' });
    }
  }

  
  static async getTagStats(req, res) {
    try {
      const { id } = req.params;

      const tag = await Tag.findById(id);
      if (!tag) {
        return res.status(404).json({ success: false, message: 'Tag not found' });
      }

      const products = await Product.find({ tags: id, status: 'active' });

      const stats = {
        totalProducts: products.length,
        totalRevenue: products.reduce((sum, p) => sum + (p.totalRevenue || 0), 0),
        totalSold: products.reduce((sum, p) => sum + (p.totalSold || 0), 0),
        averageRating: products.length > 0
          ? parseFloat((products.reduce((sum, p) => sum + p.ratings.average, 0) / products.length).toFixed(2))
          : 0,
        inStock: products.filter(p => p.stock > 0).length,
        outOfStock: products.filter(p => p.stock === 0).length
      };

      res.json({ success: true, data: { tag, stats } });
    } catch (error) {
      console.error('Get tag stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tag statistics' });
    }
  }
}

module.exports = TagController;