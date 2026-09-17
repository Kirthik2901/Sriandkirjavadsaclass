const Product = require('../../models/product');
const Category = require('../../models/category');
const SubCategory = require('../../models/subCategory');
const Tag = require('../../models/tag');
const Order = require('../../models/order');
const redisManager = require('../../config/redis');
const path = require('path');
const fs = require('fs').promises;
const SubSubCategory = require('../../models/subsubCategory');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');

let imagekit = null;
if (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
  const ImageKit = require('imagekit');
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
}

async function processReviewVideo(videoFile) {
  return new Promise(async (resolve, reject) => {
    const inputPath = videoFile.path;
    const outputDir = path.join(process.cwd(), 'uploads', 'videos', 'reviews');
    const filename = `review_${Date.now()}`;
    const outputPath = path.join(outputDir, `${filename}.webm`);
    const thumbnailPath = path.join(outputDir, `${filename}_thumb.webp`);

    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err) { 
      console.error('Error creating directory:', err); 
    }

    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const duration = metadata.format.duration;
      
      if (duration > 30) {
        fs.unlink(inputPath).catch(() => {});
        reject(new Error('Video must be 30 seconds or less'));
        return;
      }

      ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec('libvpx-vp9')
        .audioBitrate('128k')
        .videoBitrate('1500k')
        .size('1280x?')
        .outputOptions([
          '-crf 32',
          '-b:v 0',
          '-row-mt 1',
          '-cpu-used 2',
          '-deadline good'
        ])
        .format('webm')
        .on('end', async () => {
          ffmpeg(outputPath)
            .screenshots({
              timestamps: ['1'],
              filename: `${filename}_thumb.jpg`,
              folder: outputDir,
              size: '640x360'
            })
            .on('end', async () => {
              try {
                await sharp(path.join(outputDir, `${filename}_thumb.jpg`))
                  .webp({ quality: 80 })
                  .toFile(thumbnailPath);
                
                await fs.unlink(inputPath);
                await fs.unlink(path.join(outputDir, `${filename}_thumb.jpg`));
                
                const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
                resolve({
                  url: `${baseUrl}/uploads/videos/reviews/${filename}.webm`,
                  thumbnail: `${baseUrl}/uploads/videos/reviews/${filename}_thumb.webp`,
                  filePath: outputPath
                });
              } catch (err) { 
                reject(err); 
              }
            })
            .on('error', reject);
        })
        .on('error', (err) => {
          fs.unlink(inputPath).catch(() => {});
          reject(err);
        })
        .run();
    });
  });
}

function sanitizeColorNames(raw) {
  if (!raw) return [];
  let items = Array.isArray(raw) ? raw : [raw];
  let result = [];
  function extract(item) {
    if (!item) return;
    if (Array.isArray(item)) { item.forEach(extract); return; }
    if (typeof item === 'object') {
      if (item.name) extract(item.name);
      else if (item.color) extract(item.color);
      return;
    }
    if (typeof item === 'string') {
      let current = item.trim();
      let depth = 0;
      while (typeof current === 'string' && (current.startsWith('[') || current.startsWith('{') || (current.startsWith('"') && current.endsWith('"'))) && depth < 10) {
        depth++;
        try { current = JSON.parse(current); } catch (e) { break; }
      }
      if (Array.isArray(current) || (typeof current === 'object' && current !== null)) {
        extract(current);
        return;
      }
      if (typeof current === 'string') {
        const clean = current.replace(/^[\[\]"'\\]+|[\[\]"'\\]+$/g, '').trim();
        if (clean && clean !== 'null' && clean !== 'undefined') {
          result.push(clean);
        }
      }
    }
  }
  items.forEach(extract);
  return [...new Set(result)];
}

function parseBoolean(val, defaultVal = true) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (Array.isArray(val)) val = val[0];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return defaultVal;
}

const sanitizeComboItems = (rawItems) => {
  if (!rawItems) return [];
  let items = rawItems;
  if (typeof rawItems === 'string') {
    try {
      items = JSON.parse(rawItems);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];

  return items.map(item => {
    if (!item) return null;

    // Sanitize colors
    let itemColors = [];
    if (Array.isArray(item.colors)) {
      itemColors = item.colors.map(c => {
        if (typeof c === 'string') return { name: c, additionalPrice: 0 };
        if (c && typeof c === 'object') return { name: c.name || '', hex: c.hex || '', additionalPrice: Number(c.additionalPrice) || 0 };
        return null;
      }).filter(Boolean);
    }

    // Sanitize sizes
    let itemSizes = [];
    if (Array.isArray(item.sizes)) {
      itemSizes = item.sizes.map(s => {
        if (typeof s === 'string') return { value: s, additionalPrice: 0 };
        if (s && typeof s === 'object') return { value: String(s.value || ''), additionalPrice: Number(s.additionalPrice) || 0 };
        return null;
      }).filter(s => s && s.value);
    }

    // Sanitize ages
    let itemAges = [];
    if (Array.isArray(item.ages)) {
      itemAges = item.ages.map(a => {
        if (typeof a === 'string') return { value: a, gender: item.role, additionalPrice: 0 };
        if (a && typeof a === 'object') return { value: String(a.value || ''), gender: a.gender || item.role, additionalPrice: Number(a.additionalPrice) || 0 };
        return null;
      }).filter(a => a && a.value);
    }

    // Sanitize styles
    let itemStyles = [];
    if (Array.isArray(item.styles)) {
      itemStyles = item.styles.map(st => {
        if (typeof st === 'string') return { option: st, sareeLength: { value: '5.5', additionalPrice: 0 } };
        if (st && typeof st === 'object') {
          return {
            option: st.option || 'With Blouse',
            sareeLength: {
              value: st.sareeLength?.value || '5.5',
              additionalPrice: Number(st.sareeLength?.additionalPrice) || 0
            },
            blouseLength: st.blouseLength ? {
              value: st.blouseLength?.value || '0.8',
              additionalPrice: Number(st.blouseLength?.additionalPrice) || 0
            } : undefined
          };
        }
        return null;
      }).filter(Boolean);
    }

    return {
      role: item.role || 'member',
      productType: item.productType || 'Product',
      colors: itemColors,
      sizes: itemSizes,
      ages: itemAges,
      styles: itemStyles
    };
  }).filter(Boolean);
};

const sanitizeVariantsByProductType = (productType, data) => {
  const clean = { ...data };
  
  if (productType === 'CoupleCombo') {
    clean.optionType = 'Combo';
    clean.comboType = 'Couple';
    clean.age = [];
    clean.boyAge = [];
    clean.girlAge = [];
    clean.kidsGender = null;
  } else if (productType === 'DadSonCombo') {
    clean.optionType = 'Combo';
    clean.comboType = 'DadAndSon';
    clean.girlAge = [];
    clean.style = [];
    clean.womenSaree = { enabled: false, sareeLength: 5.5, options: [] };
  } else if (productType === 'FamilyCombo') {
    clean.optionType = 'Combo';
    clean.comboType = 'Family';
  } else if (productType === 'Saree') {
    clean.optionType = 'Saree';
    clean.comboType = null;
    clean.comboItems = [];
    clean.menSize = [];
    clean.boyAge = [];
    clean.girlAge = [];
    clean.size = [];
    clean.age = [];
  } else if (productType === 'MensDhotiShirt') {
    clean.optionType = 'Standard';
    clean.comboType = null;
    clean.comboItems = [];
    clean.style = [];
    clean.womenSaree = { enabled: false, sareeLength: 5.5, options: [] };
    clean.boyAge = [];
    clean.girlAge = [];
    clean.age = [];
  } else if (productType === 'PattuPavadai' || productType === 'KidsDhotiShirt') {
    clean.optionType = 'Standard';
    clean.comboType = null;
    clean.comboItems = [];
    clean.style = [];
    clean.womenSaree = { enabled: false, sareeLength: 5.5, options: [] };
    clean.menSize = [];
    clean.size = [];
    clean.boyAge = [];
    clean.girlAge = [];
  }

  return clean;
};

exports.getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = '',
      category = '',
      subCategory = '',
      subSubCategory = '',
      tags = '',
      sortBy = 'createdAt',
      order = 'desc',
      search = '',
      sku = '',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const query = {};
    
    if (req.user && ['content-admin', 'super-admin', 'system-admin'].includes(req.user.role)) {
      if (status) query.status = status;
      // Only show non-color-variant products in admin list
      query.isColorVariant = { $ne: true };
    } else {
      query.status = 'active';
      // Public view: only show non-variants (variants are accessible via color switching)
      query.isColorVariant = { $ne: true };
    }
    if (category) query.category = category;
    if (subCategory) query.subCategory = subCategory;
    if (subSubCategory) query.subSubCategory = subSubCategory;
    if (tags) query.tags = { $in: tags.split(',') };
    
    if (sku) {
      query.sku = { $regex: sku, $options: 'i' };
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    } else if (inStock === 'false') {
      query.stock = 0;
    }
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      case 'sku': sortCriteria = { sku: order === 'desc' ? -1 : 1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('subSubCategory', 'name slug')
        .populate('tags', 'name slug color')
.populate('createdBy', 'username email')
.sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .populate('subSubCategory', 'name slug')
      .populate('tags', 'name slug color')
      .populate('createdBy', 'username email')
.populate('reviews.user', 'username email')
.lean();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
};

exports.getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', order = 'desc', minPrice, maxPrice, inStock, materialType, color } = req.query;

    const cacheKey = `products:category:${categoryId}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const query = { category: categoryId, status: 'active' };
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
.populate('tags', 'name slug color')
.sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      category,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

function validateStyleData(styles) {
  if (!styles || styles.length === 0) return { valid: true };
  
  if (styles.length > 2) {
    return { 
      valid: false, 
      message: 'Maximum 2 style options allowed' 
    };
  }

  const options = styles.map(s => s.option);
  const uniqueOptions = new Set(options);
  
  if (options.length !== uniqueOptions.size) {
    return { 
      valid: false, 
      message: 'Duplicate style options not allowed' 
    };
  }

  for (const style of styles) {
    if (!['With Blouse', 'Saree Only'].includes(style.option)) {
      return { 
        valid: false, 
        message: 'Invalid style option. Must be "With Blouse" or "Saree Only"' 
      };
    }

    if (!style.sareeLength || !style.sareeLength.value) {
      return { 
        valid: false, 
        message: `Saree length is required for "${style.option}" option` 
      };
    }

    if (style.option === 'With Blouse') {
      if (!style.blouseLength || !style.blouseLength.value) {
        return { 
          valid: false, 
          message: 'Blouse length is required for "With Blouse" option' 
        };
      }
    }
  }

  return { valid: true };
}

exports.createProduct = async (req, res) => {
  try {
    console.log('Received body:', req.body);
    console.log('Received files:', req.files);

    const parseField = (field) => {
      if (!field) return [];
      try {
        return typeof field === 'string' ? JSON.parse(field) : field;
      } catch (e) {
        console.error(`Error parsing field:`, e);
        return [];
      }
    };

    const colors = parseField(req.body.color);
    
    const styles = parseField(req.body.style);
    const styleValidation = validateStyleData(styles);
    if (!styleValidation.valid) {
      return res.status(400).json({
        success: false,
        message: styleValidation.message
      });
    }
    
    // Generate or use provided SKU — never append color suffix
    let productSku = req.body.sku;
    if (!productSku) {
      const skuPrefix = req.body.name
        .substring(0, 3)
        .toUpperCase()
        .replace(/[^A-Z]/g, 'X');
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substr(2, 4).toUpperCase();
      productSku = `${skuPrefix}-${timestamp}-${random}`;
      
      let counter = 1;
      while (await Product.findOne({ sku: productSku })) {
        productSku = `${skuPrefix}-${timestamp}-${random}${counter}`;
        counter++;
      }
    }

    const allImages = parseField(req.body.gallery);
    const allFeaturedImages = parseField(req.body.featuredImages);
    
    let allVideos = [];
    if (req.files && req.files.videos) {
      const videoFiles = Array.isArray(req.files.videos) ? req.files.videos : [req.files.videos];
      if (typeof processVideo === 'function') {
        allVideos = await Promise.all(videoFiles.map(file => processVideo(file)));
      }
    } else if (req.body.videos) {
      allVideos = parseField(req.body.videos);
    }

    // Collect all color names
    const colorNames = sanitizeColorNames(colors);

    // Pick the featured image: prefer 'parent' colorVariant, else first available
    const parentFeatured = allFeaturedImages.find(img => !img.colorVariant || img.colorVariant === '' || img.colorVariant === 'parent');
    const featuredImage = parentFeatured || (allFeaturedImages.length > 0 ? allFeaturedImages[0] : undefined);

    // Gallery: all images (each carries its own colorVariant tag)
    const gallery = allImages.filter(img => img && img.url);
    allFeaturedImages.forEach(feat => {
      if (feat && feat.url && feat.colorVariant && feat.colorVariant !== 'parent') {
        const exists = gallery.some(g => g.url === feat.url);
        if (!exists) {
          gallery.push(feat);
        }
      }
    });

const productData = {
  name: req.body.name,
  sku: productSku,
  description: req.body.description,

  productType: req.body.productType,

  sellingPrice: parseFloat(req.body.sellingPrice) || 0,
      originalPrice: parseFloat(req.body.originalPrice) || 0,
      stock: parseInt(req.body.stock) || 0,
      lowStockAlert: parseInt(req.body.lowStockAlert) || 10,
      outOfStockAlert: parseInt(req.body.outOfStockAlert) || 0,
      scheduleStartDate: req.body.scheduleStartDate || undefined,
      scheduleEndDate: req.body.scheduleEndDate || undefined,
      category: req.body.category,
      subCategory: req.body.subCategory || undefined,
      subSubCategory: req.body.subSubCategory || undefined,
      status: req.body.status || 'draft',
      seoTitle: req.body.seoTitle || '',
      seoDescription: req.body.seoDescription || '',
      seoKeywords: parseField(req.body.seoKeywords),
      tags: parseField(req.body.tags),
      topCollectionImage: req.body.topCollectionImage || undefined,
      topCollectionImageFileId: req.body.topCollectionImageFileId || undefined,
      materialType: req.body.materialType || '',
      keyHighlights: parseField(req.body.keyHighlights),
      size: parseField(req.body.size),
      style: styles,
      womenSaree: req.body.womenSaree ? JSON.parse(req.body.womenSaree) : undefined,
      age: parseField(req.body.age),
      optionType: req.body.optionType || 'Standard',
      comboType: req.body.comboType || undefined,
      comboItems: sanitizeComboItems(req.body.comboItems),
      kidsGender: req.body.kidsGender || undefined,
      menSize: parseField(req.body.menSize),
      boyAge: parseField(req.body.boyAge),
      girlAge: parseField(req.body.girlAge),
      createdBy: req.user.id,
      color: colorNames,
      referral_coupon_eligible: parseBoolean(req.body.referral_coupon_eligible !== undefined ? req.body.referral_coupon_eligible : req.body.referralCouponEligible, true),
      referralCouponEligible: parseBoolean(req.body.referral_coupon_eligible !== undefined ? req.body.referral_coupon_eligible : req.body.referralCouponEligible, true),
      featuredImage: featuredImage,
      featuredImages: allFeaturedImages,
      gallery: gallery,
      videos: allVideos
    };

    console.log('Creating single product with colors:', colorNames);

    const cleanedProductData = sanitizeVariantsByProductType(productData.productType, productData);
    const product = new Product(cleanedProductData);
    const isDraft = (cleanedProductData.status === 'draft');
    await product.save({ validateBeforeSave: !isDraft });
    await product.populate('category subCategory subSubCategory tags createdBy');

    if (typeof redisManager !== 'undefined') {
      await redisManager.delPattern('products:*');
      await redisManager.delPattern('categories:*');
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: [product]
    });
  } catch (error) {
    console.error('Create product error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      return res.status(400).json({
        success: false,
        message: `A product with this ${field} already exists: ${value}`,
        error: {
          field,
          value,
          type: 'duplicate'
        }
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const existingProduct = await Product.findById(id);

    if (!existingProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const parseField = (field) => {
      if (!field) return [];
      try {
        return typeof field === 'string' ? JSON.parse(field) : field;
      } catch (e) {
        return [];
      }
    };

    const styles = parseField(req.body.style);
    const styleValidation = validateStyleData(styles);
    if (!styleValidation.valid) {
      return res.status(400).json({
        success: false,
        message: styleValidation.message
      });
    }

    const newColorNames = sanitizeColorNames(req.body.color);


const updateData = {
  name: req.body.name,
  description: req.body.description,

  productType: req.body.productType,

  sellingPrice: parseFloat(req.body.sellingPrice) || 0,
      originalPrice: parseFloat(req.body.originalPrice) || 0,
      stock: parseInt(req.body.stock) || 0,
      lowStockAlert: req.body.lowStockAlert,
      outOfStockAlert: req.body.outOfStockAlert,
      scheduleStartDate: req.body.scheduleStartDate || undefined,
      scheduleEndDate: req.body.scheduleEndDate || undefined,
      category: req.body.category,
      subCategory: req.body.subCategory || undefined,
      subSubCategory: req.body.subSubCategory || undefined,
      status: req.body.status,
      seoTitle: req.body.seoTitle,
      seoDescription: req.body.seoDescription,
      seoKeywords: parseField(req.body.seoKeywords),
      tags: parseField(req.body.tags),
      topCollectionImage: req.body.topCollectionImage !== undefined ? req.body.topCollectionImage : undefined,
      topCollectionImageFileId: req.body.topCollectionImageFileId !== undefined ? req.body.topCollectionImageFileId : undefined,
      materialType: req.body.materialType,
      color: newColorNames,
      keyHighlights: parseField(req.body.keyHighlights),
      size: parseField(req.body.size),
      style: styles,
      womenSaree: req.body.womenSaree ? JSON.parse(req.body.womenSaree) : { enabled: false, sareeLength: 5.5, options: [] },
      age: parseField(req.body.age),
      optionType: req.body.optionType || existingProduct.optionType || 'Standard',
      comboType: req.body.comboType || null,
      comboItems: sanitizeComboItems(req.body.comboItems),
      kidsGender: req.body.kidsGender || null,
      menSize: parseField(req.body.menSize),
      boyAge: parseField(req.body.boyAge),
      girlAge: parseField(req.body.girlAge),
      updatedBy: req.user.id
    };

    if (req.body.referral_coupon_eligible !== undefined || req.body.referralCouponEligible !== undefined) {
      const rawVal = req.body.referral_coupon_eligible !== undefined ? req.body.referral_coupon_eligible : req.body.referralCouponEligible;
      const isEligible = parseBoolean(rawVal, true);
      updateData.referral_coupon_eligible = isEligible;
      updateData.referralCouponEligible = isEligible;
    }

    if (req.body.gallery || req.body.featuredImages) {
      const allImages = parseField(req.body.gallery);
      const allFeaturedImages = parseField(req.body.featuredImages);
      
      const gallery = allImages.filter(img => img && img.url);
      allFeaturedImages.forEach(feat => {
        if (feat && feat.url && feat.colorVariant && feat.colorVariant !== 'parent') {
          const exists = gallery.some(g => g.url === feat.url);
          if (!exists) {
            gallery.push(feat);
          }
        }
      });
      if (gallery.length > 0 || req.body.gallery) {
        updateData.gallery = gallery;
      }

      if (allFeaturedImages.length > 0) {
        updateData.featuredImages = allFeaturedImages;
        const parentFeatured = allFeaturedImages.find(img => !img.colorVariant || img.colorVariant === '' || img.colorVariant === 'parent');
        const featuredImage = parentFeatured || allFeaturedImages[0];
        if (featuredImage) updateData.featuredImage = featuredImage;
      }
    }

    if (req.files && req.files.videos) {
      const videoFiles = Array.isArray(req.files.videos) ? req.files.videos : [req.files.videos];
      if (typeof processVideo === 'function') {
        updateData.videos = await Promise.all(videoFiles.map(file => processVideo(file)));
      }
    } else if (req.body.videos) {
      updateData.videos = parseField(req.body.videos);
    }

    const cleanedUpdateData = sanitizeVariantsByProductType(updateData.productType, updateData);

    const product = await Product.findByIdAndUpdate(
      id,
      cleanedUpdateData,
      { new: true, runValidators: true }
    ).populate('category subCategory subSubCategory tags createdBy updatedBy');
    // Delete old Top Collection Image from ImageKit if replaced
    if (
      req.body.topCollectionImageFileId && 
      existingProduct.topCollectionImageFileId && 
      req.body.topCollectionImageFileId !== existingProduct.topCollectionImageFileId
    ) {
      if (imagekit) {
        try {
          await imagekit.deleteFile(existingProduct.topCollectionImageFileId);
          console.log(`Deleted replaced Top Collection Image from ImageKit: ${existingProduct.topCollectionImageFileId}`);
        } catch (err) {
          console.error('Error deleting replaced Top Collection Image:', err);
        }
      }
    }

    await redisManager.delPattern('products:*');
    await redisManager.delPattern('categories:*');
    await redisManager.delPattern('nav:*');

    res.json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update product' });
  }
};

exports.addReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { orderId, rating, comment } = req.body;
    const userId = req.user.id;

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
      status: 'delivered'
    }).populate('items.product');

    if (!order) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only review delivered products' 
      });
    }

    const productInOrder = order.items.find(item => 
      item.product._id.toString() === productId
    );

    if (!productInOrder) {
      return res.status(403).json({ 
        success: false, 
        message: 'Product not in this order' 
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    const existingReview = product.reviews.find(r => 
      r.user.toString() === userId && r.order.toString() === orderId
    );
    
    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already reviewed this product for this order' 
      });
    }

    const gallery = req.body.gallery ? JSON.parse(req.body.gallery) : [];

    let videos = [];
    if (req.files && req.files.videos) {
      const videoFiles = Array.isArray(req.files.videos) ? req.files.videos : [req.files.videos];
      
      if (gallery.length + videoFiles.length > 5) {
        return res.status(400).json({ 
          success: false, 
          message: 'Maximum 5 gallery and videos combined' 
        });
      }

      videos = await Promise.all(videoFiles.map(file => processReviewVideo(file)));
    }

    const reviewData = {
      user: userId,
      order: orderId,
      rating: parseInt(rating),
      comment,
      images,
      videos,
      verified: true,
      createdAt: new Date()
    };

    product.reviews.push(reviewData);
    product.updateRatings();
    await product.save();

    await Order.updateOne(
      { 
        _id: orderId,
        'items.product': productId 
      },
      { 
        $set: { 'items.$.reviewed': true } 
      }
    );

    await product.populate({
      path: 'reviews.user',
      select: 'username'
    });

    await redisManager.delPattern('products:*');

    res.json({ 
      success: true, 
      message: 'Review added successfully', 
      data: product 
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to add review' 
    });
  }
};

exports.archiveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.status = 'archived';
    product.updatedBy = req.user.id;
    await product.save();
    
    // Clear cache
    await redisManager.delPattern('products:*');

    res.json({ success: true, message: 'Product archived successfully', data: product });
  } catch (error) {
    console.error('Archive product error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive product' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (imagekit) {
      for (const image of product.gallery) {
        if (image.fileId) {
          try { await imagekit.deleteFile(image.fileId); } catch (err) { console.error('Error deleting image:', err); }
        }
      }
    }

    for (const video of product.videos) {
      if (video.filePath) {
        try {
          await fs.unlink(video.filePath);
          if (video.thumbnail) {
            const thumbPath = video.thumbnail.replace(process.env.BASE_URL || 'http://localhost:3001', process.cwd());
            await fs.unlink(thumbPath);
          }
        } catch (err) { console.error('Error deleting video:', err); }
      }
    }

    await Product.findByIdAndDelete(id);
    await redisManager.delPattern('products:*');
    await redisManager.delPattern('categories:*');

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
};

exports.getProductsByTag = async (req, res) => {
  try {
    const { tagId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;

    const cacheKey = `products:tag:${tagId}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const tag = await Tag.findById(tagId);
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': 
        sortCriteria = { totalSold: -1 }; 
        break;
      case 'priceHigh': 
        sortCriteria = { sellingPrice: -1 }; 
        break;
      case 'priceLow': 
        sortCriteria = { sellingPrice: 1 }; 
        break;
      case 'nameAZ': 
        sortCriteria = { name: 1 }; 
        break;
      case 'nameZA': 
        sortCriteria = { name: -1 }; 
        break;
      case 'rating': 
        sortCriteria = { 'ratings.average': -1 }; 
        break;
      case 'createdAt':
      default: 
        sortCriteria = { createdAt: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find({ tags: tagId, status: 'active' })
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments({ tags: tagId, status: 'active' })
    ]);

    const result = {
      tag,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by tag error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getNewArrivals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 36,
      sortBy = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:new-arrivals:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const query = { status: 'active' };
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get new arrivals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch new arrivals' });
  }
};

exports.getCategoriesForNav = async (req, res) => {
  try {
    const cacheKey = 'nav:categories';
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const categories = await Category.find({ status: 'active' })
      .sort({ createdAt: 1 })
      .lean();

    const categoriesWithSubcategories = await Promise.all(
      categories.map(async (category) => {
        const subCategories = await SubCategory.find({ 
          category: category._id, 
          status: 'active' 
        }).lean();

        const subCategoriesWithProducts = await Promise.all(
          subCategories.slice(0, 3).map(async (subCategory) => {
            let subSubCategories = [];
            try {
              subSubCategories = await SubSubCategory.find({
                subCategory: subCategory._id,
                status: 'active'
              }).lean();
            } catch (error) {
              console.log('SubSubCategory not available:', error.message);
            }

            const products = await Product.find({
              category: category._id,
              subCategory: subCategory._id,
              status: 'active'
            })
            .limit(3)
            .select('name slug gallery featuredImage sellingPrice')
            .lean();

            return {
              ...subCategory,
              subSubCategories,
              products
            };
          })
        );

        return {
          ...category,
          subCategories: subCategoriesWithProducts
        };
      })
    );

    await redisManager.set(cacheKey, categoriesWithSubcategories, 600);
    res.json({ success: true, data: categoriesWithSubcategories });
  } catch (error) {
    console.error('Get categories for nav error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.searchProducts = async (req, res) => {
  try {
    const { 
      query, 
      category, 
      minPrice, 
      maxPrice, 
      tags,
      status = 'active',
      page = 1, 
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    console.log('Search request:', { query, tags, status, page, limit });

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const searchQuery = { status };

    if (query && query.trim()) {
      searchQuery.$text = { $search: query };
    }

    if (category) {
      searchQuery.category = category;
    }

    if (minPrice || maxPrice) {
      searchQuery.sellingPrice = {};
      if (minPrice) searchQuery.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) searchQuery.sellingPrice.$lte = parseFloat(maxPrice);
    }

    if (tags) {
      const tagArray = typeof tags === 'string' 
        ? tags.split(',').map(t => t.trim()) 
        : tags;
      
      console.log('Searching for tags:', tagArray);
      
      const foundTags = await Tag.find({
        $or: [
          { slug: { $in: tagArray.map(t => t.toLowerCase().replace(/\s+/g, '-')) } },
          { name: { $in: tagArray.map(t => new RegExp(`^${t}$`, 'i')) } }
        ],
        isActive: true
      }).select('_id name slug');
      
      console.log('Found tags:', foundTags);
      
      if (foundTags.length > 0) {
        searchQuery.tags = { $in: foundTags.map(t => t._id) };
      } else {
        console.log('No matching tags found - returning empty result');
        return res.json({
          success: true,
          data: {
            products: [],
            pagination: {
              currentPage: pageNum,
              totalPages: 0,
              totalProducts: 0,
              hasMore: false
            }
          }
        });
      }
    }

    console.log('Final search query:', JSON.stringify(searchQuery, null, 2));

    const [products, total] = await Promise.all([
      Product.find(searchQuery)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('tags', 'name slug color')
        .select('name slug sellingPrice originalPrice gallery featuredImage topCollectionImage stock ratings totalSold color size style age referral_coupon_eligible')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(searchQuery)
    ]);

    console.log(`Found ${products.length} products out of ${total} total`);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalProducts: total,
          hasMore: total > pageNum * limitNum
        }
      }
    });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.getProductsBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;
    const {
      page = 1,
      limit = 36,
      sortBy = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:subcategory:${subCategoryId}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const subCategory = await SubCategory.findById(subCategoryId);
    if (!subCategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const query = { subCategory: subCategoryId, status: 'active' };
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('subSubCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      subCategory,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by subcategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getProductsBySubSubCategory = async (req, res) => {
  try {
    const { subSubCategoryId } = req.params;
    const {
      page = 1,
      limit = 36,
      sortBy = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:subsubcategory:${subSubCategoryId}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const subSubCategory = await SubSubCategory.findById(subSubCategoryId);
    if (!subSubCategory) {
      return res.status(404).json({ success: false, message: 'Sub-subcategory not found' });
    }

    const query = { subSubCategory: subSubCategoryId, status: 'active' };
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('subSubCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      subSubCategory,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by subsubcategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getProductsByCategorySlug = async (req, res) => {
  try {
    const { categorySlug } = req.params;
    const {
      page = 1,
      limit = 36,
      sortBy = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:category:slug:${categorySlug}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const query = { category: category._id, status: 'active' };
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('subSubCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      category,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by category slug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getProductsBySubCategorySlug = async (req, res) => {
  try {
    const { categorySlug, subCategorySlug } = req.params;
    const {
      page = 1,
      limit = 36,
      sortBy = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:subcategory:slug:${categorySlug}:${subCategorySlug}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const subCategory = await SubCategory.findOne({ 
      slug: subCategorySlug,
      category: category._id 
    });
    if (!subCategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const query = { 
      category: category._id,
      subCategory: subCategory._id, 
      status: 'active' 
    };
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('subSubCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      category,
      subCategory,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by subcategory slug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getProductsBySubSubCategorySlug = async (req, res) => {
  try {
    const { categorySlug, subCategorySlug, subSubCategorySlug } = req.params;
    const {
      page = 1,
      limit = 36,
      sortBy = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      inStock,
      materialType,
      color
    } = req.query;

    const cacheKey = `products:subsubcategory:slug:${categorySlug}:${subCategorySlug}:${subSubCategorySlug}:${JSON.stringify(req.query)}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const subCategory = await SubCategory.findOne({ 
      slug: subCategorySlug,
      category: category._id 
    });
    if (!subCategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const subSubCategory = await SubSubCategory.findOne({ 
      slug: subSubCategorySlug,
      subCategory: subCategory._id 
    });
    if (!subSubCategory) {
      return res.status(404).json({ success: false, message: 'Sub-subcategory not found' });
    }

    const query = { 
      category: category._id,
      subCategory: subCategory._id,
      subSubCategory: subSubCategory._id, 
      status: 'active' 
    };
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query.stock = { $gt: 0 };
    else if (inStock === 'false') query.stock = 0;
    if (materialType) query.materialType = materialType;
    if (color) query.color = color;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let sortCriteria = {};
    switch (sortBy) {
      case 'bestSelling': sortCriteria = { totalSold: -1 }; break;
      case 'priceHigh': sortCriteria = { sellingPrice: -1 }; break;
      case 'priceLow': sortCriteria = { sellingPrice: 1 }; break;
      case 'nameAZ': sortCriteria = { name: 1 }; break;
      case 'nameZA': sortCriteria = { name: -1 }; break;
      case 'rating': sortCriteria = { 'ratings.average': -1 }; break;
      default: sortCriteria = { [sortBy]: order === 'desc' ? -1 : 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('subSubCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const result = {
      category,
      subCategory,
      subSubCategory,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    };

    await redisManager.set(cacheKey, result, 600);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get products by subsubcategory slug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

exports.getProductBySlug = async (req, res) => {
  try {
    const { productSlug } = req.params;

    const product = await Product.findOne({ 
      slug: productSlug,
      status: 'active'
    })
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .populate('subSubCategory', 'name slug')
      .populate('tags', 'name slug')
      .populate({
        path: 'reviews.user',
        select: 'username'
      })
      .populate({
        path: 'reviews.order',
        select: 'orderNumber'
      });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.incrementViewCount().catch(err => {
      console.error('Failed to increment view count:', err);
    });

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

exports.getProductsByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find({ category: categoryId, status: 'active' })
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('tags', 'name slug color')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments({ category: categoryId, status: 'active' })
    ]);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalProducts: total
        }
      }
    });
  } catch (error) {
    console.error('Get products by category ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

module.exports = {
  getAllProducts: exports.getAllProducts,
  getProductById: exports.getProductById,
  createProduct: exports.createProduct,
  updateProduct: exports.updateProduct,
  deleteProduct: exports.deleteProduct,
  archiveProduct: exports.archiveProduct,
  
  getProductBySlug: exports.getProductBySlug,
  getProductsByCategory: exports.getProductsByCategory,
  getProductsBySubCategory: exports.getProductsBySubCategory,
  getProductsBySubSubCategory: exports.getProductsBySubSubCategory,
  getProductsByCategorySlug: exports.getProductsByCategorySlug,
  getProductsBySubCategorySlug: exports.getProductsBySubCategorySlug,
  getProductsBySubSubCategorySlug: exports.getProductsBySubSubCategorySlug,
  getProductsByTag: exports.getProductsByTag,
  getNewArrivals: exports.getNewArrivals,
  getCategoriesForNav: exports.getCategoriesForNav,
  searchProducts: exports.searchProducts,
  addReview: exports.addReview,
  getProductsByCategoryId: exports.getProductsByCategoryId
};