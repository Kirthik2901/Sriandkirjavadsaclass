const mongoose = require('mongoose');

const keyHighlightSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: String, required: true }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },

  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },

  comment: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 2000
  },

  images: [{
    url: { type: String, required: true },
    fileId: String
  }],

  videos: [{
    url: { type: String, required: true },
    thumbnail: String,
    filePath: String
  }],

  verified: {
    type: Boolean,
    default: true
  },

  helpful: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});


/*
|--------------------------------------------------------------------------
| Saree Style Schema
|--------------------------------------------------------------------------
*/

const styleSchema = new mongoose.Schema({
  option: {
    type: String,
    required: true,
    enum: ['With Blouse', 'Saree Only']
  },

  sareeLength: {
    value: {
      type: String,
      required: true
    },

    additionalPrice: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  blouseLength: {
    value: {
      type: String
    },

    additionalPrice: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, { _id: false });


/*
|--------------------------------------------------------------------------
| Combo Item Schema
|--------------------------------------------------------------------------
|
| Used only for Combo Collection products.
|
| Example:
|
| Family Combo
|
| Husband  -> Dhoti & Shirts -> colors + sizes
| Wife     -> Saree          -> colors + styles
| Son      -> Dhoti & Shirts -> colors + ages
| Daughter -> Pattu Pavadai  -> colors + ages
|
*/

const comboItemColorSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  hex: {
    type: String,
    trim: true
  },
  additionalPrice: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const comboItemStyleSchema = new mongoose.Schema({
  option: {
    type: String,
    default: 'With Blouse'
  },
  sareeLength: {
    value: {
      type: String,
      default: '5.5'
    },
    additionalPrice: {
      type: Number,
      default: 0
    }
  },
  blouseLength: {
    value: {
      type: String,
      default: '0.8'
    },
    additionalPrice: {
      type: Number,
      default: 0
    }
  }
}, { _id: false });

const comboItemSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true
  },

  productType: {
    type: String,
    required: true
  },

  /*
  |--------------------------------------------------------------------------
  | Colors for this particular person/item
  |--------------------------------------------------------------------------
  */

  colors: [mongoose.Schema.Types.Mixed],

  /*
  |--------------------------------------------------------------------------
  | Sizes for this particular person/item
  |--------------------------------------------------------------------------
  */

  sizes: [{
    value: {
      type: String
    },

    additionalPrice: {
      type: Number,
      default: 0,
      min: 0
    }
  }],

  /*
  |--------------------------------------------------------------------------
  | Ages for children
  |--------------------------------------------------------------------------
  */

  ages: [{
    value: {
      type: String
    },

    gender: {
      type: String
    },

    additionalPrice: {
      type: Number,
      default: 0,
      min: 0
    }
  }],

  /*
  |--------------------------------------------------------------------------
  | Saree styles
  |--------------------------------------------------------------------------
  */

  styles: [comboItemStyleSchema]

}, { _id: false });


/*
|--------------------------------------------------------------------------
| Product Schema
|--------------------------------------------------------------------------
*/

const productSchema = new mongoose.Schema({

  /*
  |--------------------------------------------------------------------------
  | Basic Information
  |--------------------------------------------------------------------------
  */

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },

  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },

  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 5000
  },

  productType: {
  type: String,
  required: true,
  trim: true
},


  /*
  |--------------------------------------------------------------------------
  | Pricing
  |--------------------------------------------------------------------------
  */

originalPrice: {
  type: Number,
  required: true,
  min: 0
},

sellingPrice: {
  type: Number,
  required: true,
  min: 0,
  index: true
},


  /*
  |--------------------------------------------------------------------------
  | Stock
  |--------------------------------------------------------------------------
  */

  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
    index: true
  },

  lowStockAlert: {
    type: Number,
    default: 10
  },

  outOfStockAlert: {
    type: Number,
    default: 0
  },


  /*
  |--------------------------------------------------------------------------
  | Scheduling
  |--------------------------------------------------------------------------
  */

  scheduleStartDate: Date,

  scheduleEndDate: Date,


  /*
  |--------------------------------------------------------------------------
  | Categories
  |--------------------------------------------------------------------------
  */

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true
  },

  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubCategory',
    index: true
  },

  subSubCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubSubCategory',
    index: true
  },

  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],


  /*
  |--------------------------------------------------------------------------
  | Images
  |--------------------------------------------------------------------------
  */
  featuredImage: {
    url: String,
    fileId: String,
    alt: String,
    colorVariant: String
  },

  featuredImages: [{
    url: String,
    fileId: String,
    alt: String,
    colorVariant: String
  }],

  gallery: [{
    url: String,
    fileId: String,
    alt: String,
    colorVariant: String
  }],

  topCollectionImage: {
    type: String
  },

  topCollectionImageFileId: {
    type: String
  },


  /*
  |--------------------------------------------------------------------------
  | Videos
  |--------------------------------------------------------------------------
  */

  videos: [{
    url: {
      type: String,
      required: true
    },

    thumbnail: String,

    filePath: String,

    colorVariant: String
  }],


  /*
  |--------------------------------------------------------------------------
  | SEO
  |--------------------------------------------------------------------------
  */

  seoTitle: String,

  seoDescription: String,

  seoKeywords: [String],


  /*
  |--------------------------------------------------------------------------
  | Product Status & Eligibility
  |--------------------------------------------------------------------------
  */

  status: {
    type: String,
    enum: ['active', 'inactive', 'draft', 'archived'],
    default: 'draft',
    index: true
  },

  referral_coupon_eligible: {
    type: Boolean,
    default: true,
    index: true
  },

  referralCouponEligible: {
    type: Boolean,
    default: true
  },


  /*
  |--------------------------------------------------------------------------
  | Product Details
  |--------------------------------------------------------------------------
  */

  materialType: {
    type: String,
    index: true
  },

  /*
  |--------------------------------------------------------------------------
  | Normal Product Colors
  |--------------------------------------------------------------------------
  |
  | Used for normal products such as:
  |
  | Saree
  | Dhoti & Shirts
  | Pattu Pavadai
  |
  */

  color: [String],

  keyHighlights: [keyHighlightSchema],


  /*
  |--------------------------------------------------------------------------
  | Normal Product Sizes
  |--------------------------------------------------------------------------
  */

  size: [{
    value: {
      type: String,
      required: true
    },

    additionalPrice: {
      type: Number,
      default: 0,
      min: 0
    }
  }],


  /*
  |--------------------------------------------------------------------------
  | Normal Product Saree Styles
  |--------------------------------------------------------------------------
  */

  style: [styleSchema],


  /*
  |--------------------------------------------------------------------------
  | Normal Product Ages
  |--------------------------------------------------------------------------
  */

  age: [{
    value: {
      type: String,
      required: true
    },

    gender: {
      type: String,
      enum: ['boy', 'girl'],
      required: true
    },

    additionalPrice: {
      type: Number,
      default: 0,
      min: 0
    }
  }],


  /*
  |--------------------------------------------------------------------------
  | COMBO PRODUCT CONFIGURATION
  |--------------------------------------------------------------------------
  |
  | This is the important new field.
  |
  | Each person/item inside a combo gets its OWN:
  |
  | - role
  | - productType
  | - colors
  | - sizes
  | - ages
  | - styles
  |
  */

  comboItems: [comboItemSchema],


  /*
  |--------------------------------------------------------------------------
  | Color Variant Products
  |--------------------------------------------------------------------------
  */

  colorVariants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],

  parentProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },


  /*
  |--------------------------------------------------------------------------
  | Reviews & Ratings
  |--------------------------------------------------------------------------
  */

  reviews: [reviewSchema],

  ratings: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      index: true
    },

    count: {
      type: Number,
      default: 0
    },

    distribution: {
      5: {
        type: Number,
        default: 0
      },

      4: {
        type: Number,
        default: 0
      },

      3: {
        type: Number,
        default: 0
      },

      2: {
        type: Number,
        default: 0
      },

      1: {
        type: Number,
        default: 0
      }
    }
  },


  /*
  |--------------------------------------------------------------------------
  | Sales
  |--------------------------------------------------------------------------
  */

  totalSold: {
    type: Number,
    default: 0,
    index: true
  },

  totalRevenue: {
    type: Number,
    default: 0
  },


  /*
  |--------------------------------------------------------------------------
  | Views
  |--------------------------------------------------------------------------
  */

  viewCount: {
    type: Number,
    default: 0,
    index: true
  },

  lastViewedAt: Date,


  /*
  |--------------------------------------------------------------------------
  | Sharing
  |--------------------------------------------------------------------------
  */

  shareUrl: String,


  /*
  |--------------------------------------------------------------------------
  | User Tracking
  |--------------------------------------------------------------------------
  */

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true,

  toJSON: {
    virtuals: true
  },

  toObject: {
    virtuals: true
  }
});


/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

productSchema.index({
  name: 'text',
  description: 'text',
  sku: 'text'
});

productSchema.index({
  category: 1,
  status: 1
});

productSchema.index({
  category: 1,
  subCategory: 1,
  status: 1
});

productSchema.index({
  sellingPrice: 1,
  status: 1
});

productSchema.index({
  createdAt: -1,
  status: 1
});

productSchema.index({
  materialType: 1,
  status: 1
});

productSchema.index({
  color: 1,
  status: 1
});

productSchema.index({
  'ratings.average': -1,
  status: 1
});

productSchema.index({
  totalSold: -1,
  status: 1
});

productSchema.index({
  viewCount: -1,
  status: 1
});


/*
|--------------------------------------------------------------------------
| Pre Save
|--------------------------------------------------------------------------
*/

productSchema.pre('save', async function(next) {

  /*
  |--------------------------------------------------------------------------
  | Generate Slug
  |--------------------------------------------------------------------------
  */

  if (this.isModified('name') && !this.slug) {

    let baseSlug = 'product-' + this.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug;
    let counter = 1;

    while (
      await this.constructor.findOne({
        slug,
        _id: { $ne: this._id }
      })
    ) {

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }


  /*
  |--------------------------------------------------------------------------
  | Generate SKU
  |--------------------------------------------------------------------------
  */

  if (!this.sku) {

    const prefix = 'PRD';

    const timestamp = Date.now();

    const random = Math
      .random()
      .toString(36)
      .substr(2, 6)
      .toUpperCase();

    this.sku = `${prefix}-${timestamp}-${random}`;
  }


  /*
  |--------------------------------------------------------------------------
  | Generate Share URL
  |--------------------------------------------------------------------------
  */

  if (!this.shareUrl && this.slug) {

    const baseUrl = process.env.CLIENT_URL;

    this.shareUrl = `${baseUrl}/products/${this.slug}`;
  }

  next();
});


/*
|--------------------------------------------------------------------------
| Update Ratings
|--------------------------------------------------------------------------
*/

productSchema.methods.updateRatings = function() {

  if (this.reviews.length === 0) {

    this.ratings = {
      average: 0,
      count: 0,

      distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      }
    };

    return;
  }


  const distribution = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0
  };

  let totalRating = 0;


  this.reviews.forEach(review => {

    totalRating += review.rating;

    distribution[review.rating]++;
  });


  this.ratings = {

    average: parseFloat(
      (totalRating / this.reviews.length).toFixed(2)
    ),

    count: this.reviews.length,

    distribution
  };
};


/*
|--------------------------------------------------------------------------
| Increment View Count
|--------------------------------------------------------------------------
*/

productSchema.methods.incrementViewCount = async function() {

  this.viewCount = (this.viewCount || 0) + 1;

  this.lastViewedAt = new Date();

  return await this.save({
    validateBeforeSave: false
  });
};


/*
|--------------------------------------------------------------------------
| Discount Percentage
|--------------------------------------------------------------------------
*/

productSchema.virtual('discountPercentage').get(function() {

  if (
    this.originalPrice &&
    this.sellingPrice < this.originalPrice
  ) {

    return Math.round(
      (
        (this.originalPrice -this.sellingPrice) /
        this.originalPrice
      ) * 100
    );
  }

  return 0;
});


/*
|--------------------------------------------------------------------------
| In Stock
|--------------------------------------------------------------------------
*/

productSchema.virtual('inStock').get(function() {

  return this.stock > 0;
});


/*
|--------------------------------------------------------------------------
| Has User Reviewed
|--------------------------------------------------------------------------
*/

productSchema.methods.hasUserReviewed = function(
  userId,
  orderId
) {

  return this.reviews.some(review =>

    review.user.toString() === userId.toString() &&

    review.order.toString() === orderId.toString()

  );
};


/*
|--------------------------------------------------------------------------
| Rating Percentage
|--------------------------------------------------------------------------
*/

productSchema.methods.getRatingPercentage = function(
  rating
) {

  if (this.ratings.count === 0) {
    return 0;
  }

  return Math.round(
    (
      this.ratings.distribution[rating] /
      this.ratings.count
    ) * 100
  );
};


/*
|--------------------------------------------------------------------------
| Remove Product
|--------------------------------------------------------------------------
*/

productSchema.pre('remove', async function(next) {

  try {

    await this.model('Cart').updateMany(

      { 'items.product': this._id },

      {
        $pull: {
          items: {
            product: this._id
          }
        }
      }

    );


    await this.model('Wishlist').updateMany(

      { 'items.product': this._id },

      {
        $pull: {
          items: {
            product: this._id
          }
        }
      }

    );


    next();

  } catch (error) {

    next(error);
  }
});


/*
|--------------------------------------------------------------------------
| Find One And Delete
|--------------------------------------------------------------------------
*/

productSchema.post(
  'findOneAndDelete',
  async function(doc) {

    if (doc) {

      await doc.model('Cart').updateMany(

        { 'items.product': doc._id },

        {
          $pull: {
            items: {
              product: doc._id
            }
          }
        }

      );


      await doc.model('Wishlist').updateMany(

        { 'items.product': doc._id },

        {
          $pull: {
            items: {
              product: doc._id
            }
          }
        }

      );
    }
  }
);


/*
|--------------------------------------------------------------------------
| Find With Reviews
|--------------------------------------------------------------------------
*/

productSchema.statics.findWithReviews = function(
  query = {}
) {

  return this.find(query)

    .populate({
      path: 'reviews.user',
      select: 'username'
    })

    .populate({
      path: 'reviews.order',
      select: 'orderNumber'
    });
};


/*
|--------------------------------------------------------------------------
| Get Top Rated
|--------------------------------------------------------------------------
*/

productSchema.statics.getTopRated = function(
  limit = 10
) {

  return this.find({
    status: 'active',
    'ratings.count': { $gte: 5 }
  })

    .sort({
      'ratings.average': -1,
      'ratings.count': -1
    })

    .limit(limit);
};


/*
|--------------------------------------------------------------------------
| Get Best Sellers
|--------------------------------------------------------------------------
*/

productSchema.statics.getBestSellers = function(
  limit = 10
) {

  return this.find({
    status: 'active'
  })

    .sort({
      totalSold: -1
    })

    .limit(limit);
};


/*
|--------------------------------------------------------------------------
| Get Most Viewed
|--------------------------------------------------------------------------
*/

productSchema.statics.getMostViewed = function(
  limit = 10
) {

  return this.find({
    status: 'active'
  })

    .sort({
      viewCount: -1
    })

    .limit(limit);
};


module.exports = mongoose.model(
  'Product',
  productSchema
);