const mongoose = require('mongoose');

const blogContentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['description', 'point'],
    required: true
  },
  
  description: String,
  
  
  pointTitle: String,
  pointItems: [{
    type: {
      type: String,
      enum: ['description', 'keyValue', 'singleLine']
    },
    
    description: String,
    
    key: String,
    value: String,
    
    text: String
  }]
}, { _id: false });

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Blog title is required'],
    trim: true,
    maxlength: [500, 'Title cannot exceed 500 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  postedBy: {
    type: String,
    required: [true, 'Posted by name is required'],
    trim: true
  },
  featuredImage: {
    url: { type: String, required: true },
    fileId: String,
    alt: String
  },
  content: [blogContentSchema],
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  viewedBy: [{
    type: String
  }],
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
  timestamps: true
});


blogSchema.pre('save', async function(next) {
  if (this.isModified('title')) {
    
    let baseSlug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') 
      .replace(/\s+/g, '-')      
      .replace(/-+/g, '-')       
      .trim();
    
    
    let slug = baseSlug;
    let counter = 1;
    let slugExists = true;
    
    while (slugExists) {
      const existingBlog = await this.constructor.findOne({ 
        slug: slug,
        _id: { $ne: this._id } 
      });
      
      if (!existingBlog) {
        slugExists = false;
      } else {
        
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }
    
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model('Blog', blogSchema);