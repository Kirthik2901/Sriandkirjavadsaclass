const mongoose = require('mongoose');

const subCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'SubCategory name is required'],
    trim: true,
    maxlength: [100, 'SubCategory name cannot exceed 100 characters']
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


subCategorySchema.pre('save', function(next) {

  if (this.isModified('name')) {

    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');

  }

  next();
});


module.exports = mongoose.model(
  'SubCategory',
  subCategorySchema
);