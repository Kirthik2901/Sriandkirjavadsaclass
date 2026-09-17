const SubSubCategory = require('../../models/subsubCategory');
const SubCategory = require('../../models/subCategory');
const Category = require('../../models/category');
const Product = require('../../models/product');
const redisManager = require('../../config/redis');


/*
|--------------------------------------------------------------------------
| Get All SubSubCategories
|--------------------------------------------------------------------------
*/

exports.getAllSubSubCategories = async (req, res) => {
  try {

    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      category = '',
      subCategory = ''
    } = req.query;


    const cacheKey = `subsubcategories:${JSON.stringify(req.query)}`;

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


    if (subCategory) {
      query.subCategory = subCategory;
    }


    const pageNum = parseInt(page);

    const limitNum = parseInt(limit);

    const skip = (pageNum - 1) * limitNum;


const [
  subSubCategories,
  total
] = await Promise.all([

  SubSubCategory.find(query)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limitNum)
    .lean(),

  SubSubCategory.countDocuments(query)

]);


    const subSubCategoriesWithCounts =
      await Promise.all(

        subSubCategories.map(
          async (subSubCategory) => {

            const productCount =
              await Product.countDocuments({
                subSubCategory: subSubCategory._id
              });


            return {
              ...subSubCategory,
              productCount
            };

          }
        )

      );


    const result = {

      subSubCategories:
        subSubCategoriesWithCounts,

      pagination: {

        currentPage: pageNum,

        totalPages:
          Math.ceil(total / limitNum),

        totalSubSubCategories:
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
      'Get subsubcategories error:',
      error
    );


    res.status(500).json({
      success: false,
      message:
        'Failed to fetch subsubcategories'
    });

  }
};


/*
|--------------------------------------------------------------------------
| Get SubSubCategories By SubCategory
|--------------------------------------------------------------------------
*/

exports.getSubSubCategoriesBySubCategory = async (
  req,
  res
) => {

  try {

    const { subCategoryId } = req.params;


    const subSubCategories =
      await SubSubCategory.find({
        subCategory: subCategoryId,
        status: 'active'
      })
        .sort({ name: 1 })
        .lean();


    res.json({
      success: true,
      data: subSubCategories
    });


  } catch (error) {

    console.error(
      'Get subsubcategories by subcategory error:',
      error
    );


    res.status(500).json({
      success: false,
      message:
        'Failed to fetch subsubcategories'
    });

  }

};


/*
|--------------------------------------------------------------------------
| Get Single SubSubCategory
|--------------------------------------------------------------------------
*/

exports.getSubSubCategoryById = async (
  req,
  res
) => {

  try {

    const { id } = req.params;


    const subSubCategory =
      await SubSubCategory.findById(id)
        .populate(
          'category',
          'name slug'
        )
        .populate(
          'subCategory',
          'name slug'
        )
        .populate(
          'createdBy',
          'username email'
        );


    if (!subSubCategory) {

      return res.status(404).json({
        success: false,
        message:
          'SubSubCategory not found'
      });

    }


    res.json({
      success: true,
      data: subSubCategory
    });


  } catch (error) {

    console.error(
      'Get subsubcategory error:',
      error
    );


    res.status(500).json({
      success: false,
      message:
        'Failed to fetch subsubcategory'
    });

  }

};


/*
|--------------------------------------------------------------------------
| Create SubSubCategory
|--------------------------------------------------------------------------
*/

exports.createSubSubCategory = async (
  req,
  res
) => {

  try {

    const {
      name,
      description,
      category,
      subCategory,
      status,
      variantConfig
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | Check Duplicate
    |--------------------------------------------------------------------------
    */

    const existingSubSubCategory =
      await SubSubCategory.findOne({

        name: {
          $regex:
            new RegExp(
              `^${name}$`,
              'i'
            )
        },

        subCategory

      });


    if (existingSubSubCategory) {

      return res.status(400).json({

        success: false,

        message:
          'SubSubCategory with this name already exists in this subcategory'

      });

    }


    /*
    |--------------------------------------------------------------------------
    | Create
    |--------------------------------------------------------------------------
    */

    const subSubCategory =
      new SubSubCategory({

        name,

        description,

        category,

        subCategory,

        status,

        variantConfig,

        createdBy:
          req.user.id

      });


    await subSubCategory.save();


    await subSubCategory.populate(
      'category subCategory createdBy'
    );


    /*
    |--------------------------------------------------------------------------
    | Clear Cache
    |--------------------------------------------------------------------------
    */

    await redisManager.delPattern(
      'subsubcategories:*'
    );


    res.status(201).json({

      success: true,

      message:
        'SubSubCategory created successfully',

      data: subSubCategory

    });


  } catch (error) {

    console.error(
      'Create subsubcategory error:',
      error
    );


    res.status(500).json({

      success: false,

      message:
        error.message ||
        'Failed to create subsubcategory'

    });

  }

};


/*
|--------------------------------------------------------------------------
| Update SubSubCategory
|--------------------------------------------------------------------------
*/

exports.updateSubSubCategory = async (
  req,
  res
) => {

  try {

    const { id } = req.params;


    const {
      name,
      description,
      category,
      subCategory,
      status,
      variantConfig
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | Check Duplicate
    |--------------------------------------------------------------------------
    */

    const existingSubSubCategory =
      await SubSubCategory.findOne({

        name: {
          $regex:
            new RegExp(
              `^${name}$`,
              'i'
            )
        },

        subCategory,

        _id: {
          $ne: id
        }

      });


    if (existingSubSubCategory) {

      return res.status(400).json({

        success: false,

        message:
          'SubSubCategory with this name already exists in this subcategory'

      });

    }


    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    const updatedSubSubCategory =
      await SubSubCategory.findByIdAndUpdate(

        id,

        {
          name,
          description,
          category,
          subCategory,
          status,
          variantConfig
        },

        {
          new: true,
          runValidators: true
        }

      )
        .populate(
          'category subCategory createdBy'
        );


    if (!updatedSubSubCategory) {

      return res.status(404).json({

        success: false,

        message:
          'SubSubCategory not found'

      });

    }


    /*
    |--------------------------------------------------------------------------
    | Clear Cache
    |--------------------------------------------------------------------------
    */

    await redisManager.delPattern(
      'subsubcategories:*'
    );

    await redisManager.delPattern(
      'products:*'
    );


    res.json({

      success: true,

      message:
        'SubSubCategory updated successfully',

      data: updatedSubSubCategory

    });


  } catch (error) {

    console.error(
      'Update subsubcategory error:',
      error
    );


    res.status(500).json({

      success: false,

      message:
        error.message ||
        'Failed to update subsubcategory'

    });

  }

};


/*
|--------------------------------------------------------------------------
| Delete SubSubCategory
|--------------------------------------------------------------------------
*/

exports.deleteSubSubCategory = async (
  req,
  res
) => {

  try {

    const { id } = req.params;


    const productCount =
      await Product.countDocuments({
        subSubCategory: id
      });


    if (productCount > 0) {

      return res.status(400).json({

        success: false,

        message:
          `Cannot delete subsubcategory. It has ${productCount} product(s)`

      });

    }


    const subSubCategory =
      await SubSubCategory.findByIdAndDelete(id);


    if (!subSubCategory) {

      return res.status(404).json({

        success: false,

        message:
          'SubSubCategory not found'

      });

    }


    await redisManager.delPattern(
      'subsubcategories:*'
    );


    res.json({

      success: true,

      message:
        'SubSubCategory deleted successfully'

    });


  } catch (error) {

    console.error(
      'Delete subsubcategory error:',
      error
    );


    res.status(500).json({

      success: false,

      message:
        'Failed to delete subsubcategory'

    });

  }

};