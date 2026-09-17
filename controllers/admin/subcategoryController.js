const SubCategory = require('../../models/subCategory');
const Category = require('../../models/category');
const Product = require('../../models/product');
const redisManager = require('../../config/redis');


/*
|--------------------------------------------------------------------------
| Get All SubCategories
|--------------------------------------------------------------------------
*/

exports.getAllSubCategories = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      category = ''
    } = req.query;


    const cacheKey = `subcategories:${JSON.stringify(req.query)}`;

    const cachedData = await redisManager.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }


    const query = {};


    if (search) {
      query.name = {
        $regex: search,
        $options: 'i'
      };
    }


    if (status) {
      query.status = status;
    }


    if (category) {
      query.category = category;
    }


    const pageNum = parseInt(page);

    const limitNum = parseInt(limit);

    const skip = (pageNum - 1) * limitNum;


    /*
    |--------------------------------------------------------------------------
    | Fetch SubCategories
    |--------------------------------------------------------------------------
    |
    | Removed populate() temporarily because your
    | /api/subcategories endpoint was returning 500.
    |
    */

    const [
      subCategories,
      total
    ] = await Promise.all([

      SubCategory.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      SubCategory.countDocuments(query)

    ]);


    /*
    |--------------------------------------------------------------------------
    | Product Counts
    |--------------------------------------------------------------------------
    */

    const subCategoriesWithCounts =
      await Promise.all(

        subCategories.map(
          async (subCategory) => {

            const productCount =
              await Product.countDocuments({
                subCategory: subCategory._id
              });


            return {
              ...subCategory,
              productCount
            };

          }
        )

      );


    /*
    |--------------------------------------------------------------------------
    | Result
    |--------------------------------------------------------------------------
    */

    const result = {

      subCategories:
        subCategoriesWithCounts,

      pagination: {

        currentPage: pageNum,

        totalPages:
          Math.ceil(total / limitNum),

        totalSubCategories:
          total,

        hasNextPage:
          pageNum <
          Math.ceil(total / limitNum),

        hasPrevPage:
          pageNum > 1

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


/*
|--------------------------------------------------------------------------
| Get SubCategories By Category
|--------------------------------------------------------------------------
*/

exports.getSubCategoriesByCategory = async (
  req,
  res
) => {

  try {

    const { categoryId } = req.params;


    const subCategories =
      await SubCategory.find({
        category: categoryId,
        status: 'active'
      })
        .sort({ name: 1 })
        .lean();


    res.json({
      success: true,
      data: subCategories
    });


  } catch (error) {

    console.error(
      'Get subcategories by category error:',
      error
    );


    res.status(500).json({
      success: false,
      message:
        'Failed to fetch subcategories'
    });

  }

};


/*
|--------------------------------------------------------------------------
| Get SubCategory By ID
|--------------------------------------------------------------------------
*/

exports.getSubCategoryById = async (
  req,
  res
) => {

  try {

    const { id } = req.params;


    const subCategory =
      await SubCategory.findById(id)
        .populate(
          'category',
          'name slug'
        )
        .populate(
          'createdBy',
          'username email'
        );


    if (!subCategory) {

      return res.status(404).json({
        success: false,
        message:
          'SubCategory not found'
      });

    }


    res.json({
      success: true,
      data: subCategory
    });


  } catch (error) {

    console.error(
      'Get subcategory error:',
      error
    );


    res.status(500).json({
      success: false,
      message:
        'Failed to fetch subcategory'
    });

  }

};


/*
|--------------------------------------------------------------------------
| Create SubCategory
|--------------------------------------------------------------------------
*/

exports.createSubCategory = async (
  req,
  res
) => {

  try {

    const {
      name,
      description,
      category,
      status
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | Check Duplicate
    |--------------------------------------------------------------------------
    */

    const existingSubCategory =
      await SubCategory.findOne({

        name: {
          $regex:
            new RegExp(
              `^${name}$`,
              'i'
            )
        },

        category

      });


    if (existingSubCategory) {

      return res.status(400).json({

        success: false,

        message:
          'SubCategory with this name already exists in this category'

      });

    }


    /*
    |--------------------------------------------------------------------------
    | Create
    |--------------------------------------------------------------------------
    */

    const subCategory =
      new SubCategory({

        name,

        description,

        category,

        status,

        createdBy:
          req.user.id

      });


    await subCategory.save();


    await subCategory.populate(
      'category createdBy'
    );


    /*
    |--------------------------------------------------------------------------
    | Clear Cache
    |--------------------------------------------------------------------------
    */

    await redisManager.delPattern(
      'subcategories:*'
    );


    res.status(201).json({

      success: true,

      message:
        'SubCategory created successfully',

      data: subCategory

    });


  } catch (error) {

    console.error(
      'Create subcategory error:',
      error
    );


    res.status(500).json({

      success: false,

      message:
        error.message ||
        'Failed to create subcategory'

    });

  }

};


/*
|--------------------------------------------------------------------------
| Update SubCategory
|--------------------------------------------------------------------------
*/

exports.updateSubCategory = async (
  req,
  res
) => {

  try {

    const { id } = req.params;


    const {
      name,
      description,
      category,
      status
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | Check Duplicate
    |--------------------------------------------------------------------------
    */

    const existingSubCategory =
      await SubCategory.findOne({

        name: {
          $regex:
            new RegExp(
              `^${name}$`,
              'i'
            )
        },

        category,

        _id: {
          $ne: id
        }

      });


    if (existingSubCategory) {

      return res.status(400).json({

        success: false,

        message:
          'SubCategory with this name already exists in this category'

      });

    }


    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    const updatedSubCategory =
      await SubCategory.findByIdAndUpdate(

        id,

        {
          name,
          description,
          category,
          status
        },

        {
          new: true,
          runValidators: true
        }

      )
        .populate(
          'category createdBy'
        );


    if (!updatedSubCategory) {

      return res.status(404).json({

        success: false,

        message:
          'SubCategory not found'

      });

    }


    /*
    |--------------------------------------------------------------------------
    | Clear Cache
    |--------------------------------------------------------------------------
    */

    await redisManager.delPattern(
      'subcategories:*'
    );

    await redisManager.delPattern(
      'products:*'
    );


    res.json({

      success: true,

      message:
        'SubCategory updated successfully',

      data: updatedSubCategory

    });


  } catch (error) {

    console.error(
      'Update subcategory error:',
      error
    );


    res.status(500).json({

      success: false,

      message:
        error.message ||
        'Failed to update subcategory'

    });

  }

};


/*
|--------------------------------------------------------------------------
| Delete SubCategory
|--------------------------------------------------------------------------
*/

exports.deleteSubCategory = async (
  req,
  res
) => {

  try {

    const { id } = req.params;


    console.log(
      '========== DELETE SUBCATEGORY =========='
    );

    console.log(
      'ID:',
      id
    );


    const productCount =
      await Product.countDocuments({
        subCategory: id
      });


    console.log(
      'Product Count:',
      productCount
    );


    const subCategory =
      await SubCategory.findById(id);


    console.log(
      'SubCategory Exists:',
      !!subCategory
    );


    if (productCount > 0) {

      return res.status(400).json({

        success: false,

        message:
          `Cannot delete subcategory. It has ${productCount} product(s)`

      });

    }


    const deleted =
      await SubCategory.findByIdAndDelete(id);


    console.log(
      'Deleted Document:',
      deleted
    );


    await redisManager.delPattern(
      'subcategories:*'
    );


    return res.json({

      success: true,

      message:
        'SubCategory deleted successfully'

    });


  } catch (error) {

    console.error(
      'DELETE ERROR:',
      error
    );


    return res.status(500).json({

      success: false,

      message:
        error.message

    });

  }

};