const SubCategory = require('../models/subCategory');
const redisManager = require('../config/redis');

exports.getAllSubCategories = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      status = 'active'
    } = req.query;

    const cacheKey = `subcategories:public:${JSON.stringify(req.query)}`;

    const cachedData = await redisManager.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const query = { status };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [subCategories, total] = await Promise.all([
      SubCategory.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      SubCategory.countDocuments(query)
    ]);

    const result = {
      subCategories,

      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalSubCategories: total
      }
    };

    await redisManager.set(
      cacheKey,
      result,
      600
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {

    console.error(
      'Get subcategories error:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        error.message ||
        'Failed to fetch subcategories'
    });
  }
};

module.exports = {
  getAllSubCategories: exports.getAllSubCategories
};