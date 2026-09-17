const Blog = require('../../models/blog');
const redisManager = require('../../config/redis');

exports.getAllBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = req.query;

    const cacheKey = `blogs:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const query = {};
    if (status) query.status = status;
    if (search) query.title = { $regex: search, $options: 'i' };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('createdBy', 'username email')
        .sort({ featured: -1, createdAt: -1 }) 
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Blog.countDocuments(query)
    ]);

    const result = {
      blogs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalBlogs: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blogs' });
  }
};

exports.getBlogById = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findById(id)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    res.json({ success: true, data: blog });
  } catch (error) {
    console.error('Get blog error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blog' });
  }
};

exports.getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const blog = await Blog.findOne({ slug, status: 'published' })
      .populate('createdBy', 'username email');

    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    const { visitorId } = req.query;
    const userIdentifier = visitorId || req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    if (!blog.viewedBy.includes(userIdentifier)) {
      blog.views += 1;
      blog.viewedBy.push(userIdentifier);
      await blog.save();
    }

    res.json({ success: true, data: blog });
  } catch (error) {
    console.error('Get blog by slug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blog' });
  }
};

exports.createBlog = async (req, res) => {
  try {
    const { title, postedBy, featuredImage, content, status, featured } = req.body;

    const blog = new Blog({
      title,
      postedBy,
      featuredImage: typeof featuredImage === 'string' ? JSON.parse(featuredImage) : featuredImage,
      content: typeof content === 'string' ? JSON.parse(content) : content,
      status,
      featured: featured || false,
      createdBy: req.user.id
    });

    await blog.save();
    await blog.populate('createdBy', 'username email');

    await redisManager.delPattern('blogs:*');

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog
    });
  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create blog'
    });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, postedBy, featuredImage, content, status, featured } = req.body;

    
    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    
    let processedFeaturedImage;
    if (typeof featuredImage === 'string') {
      if (featuredImage.startsWith('http')) {
        
        processedFeaturedImage = existingBlog.featuredImage;
      } else {
        
        processedFeaturedImage = JSON.parse(featuredImage);
      }
    } else {
      
      processedFeaturedImage = featuredImage;
    }

    const updateData = {
      title,
      postedBy,
      featuredImage: processedFeaturedImage,
      content: typeof content === 'string' ? JSON.parse(content) : content,
      status,
      featured: featured !== undefined ? featured : false,
      updatedBy: req.user.id
    };

    const blog = await Blog.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    }).populate('createdBy updatedBy', 'username email');

    await redisManager.delPattern('blogs:*');

    res.json({
      success: true,
      message: 'Blog updated successfully',
      data: blog
    });
  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update blog'
    });
  }
};

exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findByIdAndDelete(id);
    
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    await redisManager.delPattern('blogs:*');

    res.json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete blog' });
  }
};