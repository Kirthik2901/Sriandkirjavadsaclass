const mongoose = require('mongoose');

const subSubCategorySchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'SubSubCategory name is required'],
    trim: true,
    maxlength: [100, 'SubSubCategory name cannot exceed 100 characters']
  },

  slug: {
    type: String,
    lowercase: true
  },

  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Parent category is required']
  },

  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubCategory',
    required: [true, 'Parent subcategory is required']
  },


  /*
  |--------------------------------------------------------------------------
  | Variant Configuration
  |--------------------------------------------------------------------------
  |
  | This tells the Product Form what variant fields should be displayed
  | automatically when this SubSubCategory is selected.
  |
  */

  variantConfig: {

    type: {
      type: String,
      enum: [
        'saree',
        'dhotiShirt',
        'pattuPavadai',
        'combo',
        'custom'
      ],
      default: 'custom'
    },

    options: {

      colors: {
        type: Boolean,
        default: false
      },

      sizes: {
        type: Boolean,
        default: false
      },

      ages: {
        type: Boolean,
        default: false
      },

      sareeStyles: {
        type: Boolean,
        default: false
      }

    }

  },


  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }

}, {
  timestamps: true
});


/*
|--------------------------------------------------------------------------
| Generate Slug
|--------------------------------------------------------------------------
*/

subSubCategorySchema.pre('save', function(next) {

  if (this.isModified('name')) {

    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');

  }

  next();

});


module.exports =
  mongoose.models.SubSubCategory ||
  mongoose.model('SubSubCategory', subSubCategorySchema);