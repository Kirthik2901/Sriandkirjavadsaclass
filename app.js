const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cron = require('cron');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const connectDB = require('./config/database');
const redisManager = require('./config/redis');


const { errorHandler } = require('./middlewares/authMiddleware');
const { rateLimits, securityMiddleware } = require('./middlewares/security');
const { compressionMiddleware, performanceMonitor, memoryMonitor } = require('./middlewares/performance');
const { updateUserActivity, trackVisitor } = require('./middlewares/useractivityMiddleware');


const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes'); 
const subcategoryRoutes = require('./routes/subCategoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const orderRoutes = require('./routes/orderRoutes');
const referralRoutes = require('./routes/referralRoutes');
const couponRoutes = require('./routes/couponRoutes');
const imagekitRoutes = require('./routes/imagekit');
const blogRoutes = require('./routes/blogRoutes');
const paymentRoutes = require('./payment/payment.routes');
const shiprocketRoutes = require('./routes/shiprocketRoutes');
const shippingSyncRoutes = require('./routes/shippingSyncRoutes');
const replacementRoutes = require('./routes/replacementRoutes');

const adminUserRoutes = require('./routes/admin/userRoutes');
const adminProductRoutes = require('./routes/admin/productRoutes');
const adminCategoryRoutes = require('./routes/admin/categoryRoutes');
const adminSubCategoryRoutes = require('./routes/admin/subcategoryRoutes');
const adminSubSubCategoryRoutes = require('./routes/admin/subsubCategoryRoutes');
const adminTagRoutes = require('./routes/admin/tagRoutes');
const adminBannerRoutes = require('./routes/admin/bannerRoutes');
const adminOrderRoutes = require('./routes/admin/orderRoutes');
const adminCouponRoutes = require('./routes/admin/couponRoutes');
const adminHeaderOfferRoutes = require('./routes/admin/headerOfferRoutes');
const adminAnalyticsRoutes = require('./routes/admin/analyticsRoutes');
const adminSystemRoutes = require('./routes/admin/systemRoutes');
const adminBlogRoutes = require('./routes/admin/blogRoutes');
const adminExportRoutes = require('./routes/admin/exportRoutes');
const adminReplacementRoutes = require('./routes/admin/replacementRoutes');

const app = express();


app.set('trust proxy', 1);


app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'"],
    },
  }
}));


app.use(compressionMiddleware);
app.use(performanceMonitor);
app.use(memoryMonitor);


app.use(...securityMiddleware);


if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}


app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL,
     'http://localhost:4200',
      'http://localhost:49609',
      'http://localhost:3001',
      'https://admin.yourdomain.com'
    ];
    
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));


app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use(cookieParser());


app.use(trackVisitor);


// Replacement evidence videos are access-controlled; block direct static exposure.
app.use('/uploads/videos/replacements', (req, res) => {
  res.status(403).json({ success: false, message: 'Access denied' });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

app.use('/uploads/videos', express.static(path.join(__dirname, 'uploads/videos'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));


app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV
  });
});


app.use('/api/auth', rateLimits.auth, authRoutes);
app.use('/api/users', rateLimits.general, userRoutes);
app.use('/api', imagekitRoutes);
app.use('/api/cart', rateLimits.general, cartRoutes);
app.use('/api/subcategories', rateLimits.general, subcategoryRoutes);
app.use('/api/wishlist', rateLimits.general, wishlistRoutes);
app.use('/api/orders', rateLimits.general, orderRoutes);
app.use('/api/products', rateLimits.general, productRoutes);
app.use('/api/referrals', rateLimits.general, referralRoutes);
app.use('/api/coupons', rateLimits.general, couponRoutes);
app.use('/api/blogs', rateLimits.general, blogRoutes);
app.use('/api/payment', paymentRoutes); // Rate limiting is handled internally in payment routes
app.use('/api/shiprocket', shiprocketRoutes);
app.use('/api/shipping', shippingSyncRoutes);
app.use('/api/replacements', rateLimits.general, replacementRoutes);

app.use('/api/admin/users', rateLimits.general, adminUserRoutes);
app.use('/api/admin/products', rateLimits.general, adminProductRoutes);
app.use('/api/admin/categories', rateLimits.general, adminCategoryRoutes);
app.use('/api/admin/subcategories', rateLimits.general, adminSubCategoryRoutes);
app.use('/api/admin/subsubcategories', rateLimits.general, adminSubSubCategoryRoutes);
app.use('/api/admin/tags', rateLimits.search, adminTagRoutes);
app.use('/api/admin/banners', rateLimits.general, adminBannerRoutes);
app.use('/api/admin/orders', rateLimits.general, adminOrderRoutes);
app.use('/api/admin/coupons', rateLimits.general, adminCouponRoutes);
app.use('/api/admin/header-offers', rateLimits.general, adminHeaderOfferRoutes);
app.use('/api/admin/analytics', rateLimits.general, adminAnalyticsRoutes);
app.use('/api/admin/system', rateLimits.general, adminSystemRoutes);
app.use('/api/admin/blogs', rateLimits.general, adminBlogRoutes);
app.use('/api/admin/export', rateLimits.export, adminExportRoutes);
app.use('/api/admin/replacement-requests', rateLimits.general, adminReplacementRoutes);

app.use('/api', updateUserActivity);


app.get('/api/admin/status', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const redisStatus = redisManager.isConnected ? 'connected' : 'disconnected';
    
    res.json({
      success: true,
      data: {
        mongodb: mongoStatus,
        redis: redisStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        version: process.version,
        environment: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get system status'
    });
  }
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});


app.use(errorHandler);


const setupScheduledTasks = () => {
  
  new cron.CronJob('*/30 * * * * *', async () => {
    try {
      const now = new Date();
      const Banner = require('./models/banner');

      const activatedBanners = await Banner.updateMany(
        {
          status: 'scheduled',
          startDate: { $lte: now },
          $or: [{ endDate: { $gte: now } }, { endDate: null }]
        },
        { status: 'active' }
      );

      const deactivatedBanners = await Banner.updateMany(
        {
          status: 'scheduled',
          endDate: { $exists: true, $ne: null, $lt: now }
        },
        { status: 'inactive' }
      );

      const expiredActiveBanners = await Banner.updateMany(
        {
          status: 'active',
          endDate: { $exists: true, $ne: null, $lt: now }
        },
        { status: 'inactive' }
      );

      if (activatedBanners.modifiedCount > 0 || deactivatedBanners.modifiedCount > 0 || expiredActiveBanners.modifiedCount > 0) {
        console.log(`Banner schedule: ${activatedBanners.modifiedCount} activated, ${deactivatedBanners.modifiedCount + expiredActiveBanners.modifiedCount} deactivated`);
        await redisManager.delPattern('banners:*');
      }
    } catch (error) {
      console.error('Scheduled banner update error:', error);
    }
  }, null, true);

  // Expire pending payments older than 30 minutes
  new cron.CronJob('0 * * * * *', async () => {
    try {
      const Order = require('./models/order');
      const Payment = require('./models/payment');
      
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const expiredOrders = await Order.find({
        paymentStatus: { $in: ['pending', 'payment_initiated'] },
        createdAt: { $lt: thirtyMinsAgo }
      });

      for (const order of expiredOrders) {
        order.paymentStatus = 'expired';
        order.status = 'cancelled';
        order.cancellationReason = 'Payment timeout';
        order.cancelledBy = 'system';
        await order.save();
        
        if (order.razorpayOrderId) {
          await Payment.updateOne(
            { razorpayOrderId: order.razorpayOrderId },
            { $set: { status: 'failed', failureReason: 'Payment timeout' } }
          );
        }
      }
      
      if (expiredOrders.length > 0) {
        console.log(`Payment timeout: Expired ${expiredOrders.length} orders`);
      }
    } catch (error) {
      console.error('Payment timeout cron error:', error);
    }
  }, null, true);

  // Cache cleanup
  new cron.CronJob('0 0 * * * *', async () => {
    try {
      console.log('Cleaning up expired cache entries...');
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }, null, true);

  
  new cron.CronJob('0 0 0 * * *', async () => {
    try {
      console.log('Generating daily reports...');
    } catch (error) {
      console.error('Daily report generation error:', error);
    }
  }, null, true);

  
  new cron.CronJob('0 0 */6 * * *', async () => {
    try {
      console.log('Cleaning up temporary files...');
      const fs = require('fs').promises;
      const path = require('path');
      
      const tempDirs = [
        path.join(process.cwd(), 'uploads/temp/images'),
        path.join(process.cwd(), 'uploads/temp/videos')
      ];

      for (const dir of tempDirs) {
        try {
          const files = await fs.readdir(dir);
          const now = Date.now();
          
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);
            const fileAge = now - stats.mtimeMs;
            
            if (fileAge > 6 * 60 * 60 * 1000) {
              await fs.unlink(filePath);
              console.log(`Deleted old temp file: ${file}`);
            }
          }
        } catch (err) {
          console.error(`Error cleaning ${dir}:`, err);
        }
      }
    } catch (error) {
      console.error('Temp file cleanup error:', error);
    }
  }, null, true);

  console.log('Scheduled tasks set up successfully');
  console.log('  - Banner schedule check: Every 30 seconds');
  console.log('  - Cache cleanup: Every hour');
  console.log('  - Daily reports: Every midnight');
  console.log('  - Temp file cleanup: Every 6 hours');
};


const { startCartAbandonmentService } = require('./services/cartAbandonmentService');

const startServer = async () => {
  try {
    console.log('Step 1: Connecting to MongoDB...');
    await connectDB();
    console.log('Step 2: MongoDB connected successfully');
    
    console.log('Step 3: Starting HTTP server...');
    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, () => {
      console.log(`Step 4: Server running on port ${PORT}`);
      
    });

    console.log('Step 5: Setting up scheduled tasks...');
    setupScheduledTasks();

    console.log('Step 6: Server startup complete');

  } catch (error) {
    console.error('STARTUP ERROR:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
};

startServer();

module.exports = app;