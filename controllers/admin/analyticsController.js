const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const redisManager = require('../../config/redis');

const ORDER_REVENUE_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];


const getDateRange = (period) => {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case '1W':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    case '1M':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    case '1Y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = now;
  }

  return { startDate, endDate };
};

/**
 * Format date range for display
 */
const formatDateRange = (startDate, endDate) => {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = startDate.toLocaleDateString('en-US', options);
  const end = endDate.toLocaleDateString('en-US', options);
  return `${start} - ${end}`;
};


const calculateChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};


const getKPIData = async (startDate, endDate) => {
  try {
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);
    const previousEndDate = startDate;

    const [
      currentOrders,
      previousOrders,
      currentVisitors,
      previousVisitors,
      liveVisitors
    ] = await Promise.all([
      
      Order.find({
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] }
      }).lean(),
      
      
      Order.find({
        createdAt: { $gte: previousStartDate, $lt: previousEndDate },
        status: { $in: ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] }
      }).lean(),
      
      
      User.countDocuments({
        lastLogin: { $gte: startDate, $lte: endDate },
        isActive: true
      }),
      
      
      User.countDocuments({
        lastLogin: { $gte: previousStartDate, $lt: previousEndDate },
        isActive: true
      }),
      
      
User.countDocuments({
  lastActive: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
  isActive: true
})
    ]);

    
    const currentSales = currentOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const previousSales = previousOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    
    const currentOrderCount = currentOrders.length;
    const previousOrderCount = previousOrders.length;

    
    const currentReturns = await Order.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'returned'
    });
    
    const previousReturns = await Order.countDocuments({
      createdAt: { $gte: previousStartDate, $lt: previousEndDate },
      status: 'returned'
    });

    const currentReturnRate = currentOrderCount > 0 
      ? parseFloat(((currentReturns / currentOrderCount) * 100).toFixed(1))
      : 0;
    const previousReturnRate = previousOrderCount > 0 
      ? parseFloat(((previousReturns / previousOrderCount) * 100).toFixed(1))
      : 0;

    // Lower return rate is better: positive change = improvement (fewer returns vs prior period)
    const returnRateChange = parseFloat((previousReturnRate - currentReturnRate).toFixed(1));

    return {
      totalSales: {
        value: Math.round(currentSales),
        change: calculateChange(currentSales, previousSales)
      },
      totalVisitors: {
        value: currentVisitors,
        change: calculateChange(currentVisitors, previousVisitors)
      },
      liveVisitors: {
        value: liveVisitors,
        change: 0
      },
      totalOrders: {
        value: currentOrderCount,
        change: calculateChange(currentOrderCount, previousOrderCount)
      },
      returnRate: {
        value: currentReturnRate,
        change: returnRateChange
      }
    };
  } catch (error) {
    console.error('Error calculating KPI data:', error);
    throw error;
  }
};

/**
 * Get sales trend data
 */
const getSalesTrend = async (startDate, endDate, period) => {
  try {
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] }
    }).lean();

    const dayMs = 24 * 60 * 60 * 1000;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let groupedData = [];

    if (period === '1W') {
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const dayStart = d.getTime();
        const dayEnd = dayStart + dayMs - 1;
        const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
        let sum = 0;
        orders.forEach(order => {
          const t = new Date(order.createdAt).getTime();
          if (t >= dayStart && t <= dayEnd) {
            sum += order.totalAmount || 0;
          }
        });
        groupedData.push({ label, value: Math.round(sum) });
      }
    } else if (period === '1M') {
      const weeklySales = [0, 0, 0, 0];
      orders.forEach(order => {
        const daysSinceStart = Math.floor((new Date(order.createdAt) - startDate) / dayMs);
        if (daysSinceStart < 0 || daysSinceStart > 29) return;
        const weekIdx = Math.min(Math.floor(daysSinceStart / 7), 3);
        weeklySales[weekIdx] += order.totalAmount || 0;
      });
      groupedData = weeklySales.map((v, i) => ({
        label: `Week ${i + 1}`,
        value: Math.round(v)
      }));
    } else if (period === '1Y') {
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = d.getMonth();
        const y = d.getFullYear();
        let sum = 0;
        orders.forEach(order => {
          const od = new Date(order.createdAt);
          if (od.getMonth() === m && od.getFullYear() === y) {
            sum += order.totalAmount || 0;
          }
        });
        const label = monthNames[m];
        groupedData.push({ label, value: Math.round(sum) });
      }
    }

    return groupedData;
  } catch (error) {
    console.error('Error calculating sales trend:', error);
    throw error;
  }
};


const getMostViewedProducts = async (startDate, endDate, limit = 4) => {
  try {
    // All-time views (viewCount); period filter removed — lastViewedAt excluded most catalog from results
    const products = await Product.find({
      status: 'active',
      viewCount: { $gt: 0 }
    })
      .sort({ viewCount: -1 })
      .limit(limit)
      .populate('category', 'name')
      .select('name category gallery viewCount slug lastViewedAt')
      .lean();

    return products.map(product => ({
      id: product._id.toString(),
      name: product.name,
      category: product.category?.name || 'Uncategorized',
      image: product.gallery && product.gallery.length > 0 
        ? product.gallery[0].url 
        : '',
      metric: product.viewCount || 0,
      slug: product.slug
    }));
  } catch (error) {
    console.error('Error fetching most viewed products:', error);
    throw error;
  }
};


const getBestSellingProducts = async (startDate, endDate, limit = 3) => {
  try {
    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: limit }, 
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productData'
        }
      },
      { $unwind: '$productData' },
      {
        $match: {
          'productData.status': 'active'
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'productData.category',
          foreignField: '_id',
          as: 'categoryData'
        }
      }
    ]);

    return salesData.map((item, index) => ({
      id: item.productData._id.toString(),
      name: item.productData.name,
      category: item.categoryData && item.categoryData[0] ? item.categoryData[0].name : 'Uncategorized',
      image: item.productData.gallery && item.productData.gallery.length > 0 
        ? item.productData.gallery[0].url 
        : '',
      metric: item.totalSold,
      rank: index + 1,
      slug: item.productData.slug
    }));
  } catch (error) {
    console.error('Error fetching best selling products:', error);
    throw error;
  }
};


const getHighlyRatedProducts = async (startDate, endDate, limit = 3) => {
  try {
    const products = await Product.find({
      status: 'active',
      'ratings.count': { $gte: 1 },
      createdAt: { $lte: endDate }
    })
      .sort({ 'ratings.average': -1, 'ratings.count': -1 })
      .limit(limit) 
      .populate('category', 'name')
      .select('name category gallery ratings slug')
      .lean();

    return products.map(product => ({
      id: product._id.toString(),
      name: product.name,
      category: product.category?.name || 'Uncategorized',
      image: product.gallery && product.gallery.length > 0 
        ? product.gallery[0].url 
        : '',
      metric: 0,
      rating: product.ratings?.average || 0,
      reviewCount: product.ratings?.count || 0,
      slug: product.slug
    }));
  } catch (error) {
    console.error('Error fetching highly rated products:', error);
    throw error;
  }
};


const getProductsNeedingAttention = async (startDate, endDate, limit = 3) => {
  try {
    const periodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
    const periodLabel = periodDays <= 7 ? '7d' : periodDays <= 30 ? '30d' : 'Year';

    const needsAttention = [];

    
    const lowViewProducts = await Product.find({
      status: 'active',
      $or: [
        { viewCount: { $eq: 0 } },
        { lastViewedAt: { $lt: startDate } }
      ]
    })
      .sort({ viewCount: 1 })
      .limit(limit)
      .populate('category', 'name')
      .select('name category gallery viewCount slug')
      .lean();

    lowViewProducts.forEach(product => {
      needsAttention.push({
        id: product._id.toString(),
        name: product.name,
        category: product.category?.name || 'Uncategorized',
        image: product.gallery && product.gallery.length > 0 
          ? product.gallery[0].url 
          : '',
        metric: `${product.viewCount || 0} Views`,
        slug: product.slug
      });
    });

    
    if (needsAttention.length < limit) {
      const lowSalesProducts = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] }
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalSold: { $sum: '$items.quantity' }
          }
        },
        {
          $match: {
            totalSold: { $lte: 2 }
          }
        },
        { $sort: { totalSold: 1 } },
        { $limit: limit - needsAttention.length },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productData'
          }
        },
        { $unwind: '$productData' },
        {
          $match: {
            'productData.status': 'active'
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'productData.category',
            foreignField: '_id',
            as: 'categoryData'
          }
        }
      ]);

      lowSalesProducts.forEach(item => {
        const product = item.productData;
        const alreadyAdded = needsAttention.some(p => p.id === product._id.toString());
        
        if (!alreadyAdded && needsAttention.length < limit) {
          needsAttention.push({
            id: product._id.toString(),
            name: product.name,
            category: item.categoryData && item.categoryData[0] ? item.categoryData[0].name : 'Uncategorized',
            image: product.gallery && product.gallery.length > 0 
              ? product.gallery[0].url 
              : '',
            metric: `${item.totalSold} Sales (Last ${periodLabel})`,
            slug: product.slug
          });
        }
      });
    }

    
    if (needsAttention.length < limit) {
      const highReturnProducts = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'returned'
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            returnCount: { $sum: 1 }
          }
        },
        {
          $match: {
            returnCount: { $gte: 1 }
          }
        },
        { $sort: { returnCount: -1 } },
        { $limit: limit - needsAttention.length },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productData'
          }
        },
        { $unwind: '$productData' },
        {
          $match: {
            'productData.status': 'active'
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'productData.category',
            foreignField: '_id',
            as: 'categoryData'
          }
        }
      ]);

      highReturnProducts.forEach(item => {
        const product = item.productData;
        const alreadyAdded = needsAttention.some(p => p.id === product._id.toString());
        
        if (!alreadyAdded && needsAttention.length < limit) {
          needsAttention.push({
            id: product._id.toString(),
            name: product.name,
            category: item.categoryData && item.categoryData[0] ? item.categoryData[0].name : 'Uncategorized',
            image: product.gallery && product.gallery.length > 0 
              ? product.gallery[0].url 
              : '',
            metric: `${item.returnCount} Return${item.returnCount > 1 ? 's' : ''}`,
            slug: product.slug
          });
        }
      });
    }

    return needsAttention.slice(0, limit); 
  } catch (error) {
    console.error('Error fetching products needing attention:', error);
    throw error;
  }
};

async function buildDashboardStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const revenueMatch = { status: { $in: ORDER_REVENUE_STATUSES } };

  const [
    productTotal,
    productActive,
    lowStockCount,
    outOfStockCount,
    ordersThisMonth,
    ordersThisYear,
    ordersToday,
    revenueMonthAgg,
    revenueYearAgg,
    revenueTodayAgg,
    customerTotal,
    customersNewMonth,
    pendingOrders
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ status: 'active' }),
    Product.countDocuments({
      status: 'active',
      $expr: {
        $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockAlert'] }]
      }
    }),
    Product.countDocuments({ status: 'active', stock: 0 }),
    Order.countDocuments({
      createdAt: { $gte: startOfMonth },
      ...revenueMatch
    }),
    Order.countDocuments({
      createdAt: { $gte: startOfYear },
      ...revenueMatch
    }),
    Order.countDocuments({
      createdAt: { $gte: startOfToday },
      ...revenueMatch
    }),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfMonth }, ...revenueMatch } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfYear }, ...revenueMatch } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfToday }, ...revenueMatch } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } }),
    Order.countDocuments({
      status: { $in: ['pending', 'confirmed', 'processing'] }
    })
  ]);

  const { startDate, endDate } = getDateRange('1W');
  const salesTrend7d = await getSalesTrend(startDate, endDate, '1W');

  return {
    products: {
      total: productTotal,
      active: productActive,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount
    },
    orders: {
      thisMonth: ordersThisMonth,
      thisYear: ordersThisYear,
      today: ordersToday,
      pending: pendingOrders
    },
    revenue: {
      thisMonth: Math.round(revenueMonthAgg[0]?.total || 0),
      thisYear: Math.round(revenueYearAgg[0]?.total || 0),
      today: Math.round(revenueTodayAgg[0]?.total || 0)
    },
    customers: {
      total: customerTotal,
      newThisMonth: customersNewMonth
    },
    salesTrend7d,
    generatedAt: now.toISOString()
  };
}

exports.getDashboardStats = async (req, res) => {
  try {
    const cacheKey = 'analytics:dashboard';
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const data = await buildDashboardStats();
    await redisManager.set(cacheKey, data, 60);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { period = '1W' } = req.query;
    
    if (!['1W', '1M', '1Y'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period. Must be 1W, 1M, or 1Y'
      });
    }

    const cacheKey = `analytics:${period}`;
    const cachedData = await redisManager.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const { startDate, endDate } = getDateRange(period);
    const dateRange = formatDateRange(startDate, endDate);

    const [
      kpi,
      salesTrend,
      mostViewed,
      bestSelling,
      highlyRated,
      needsAttention
    ] = await Promise.all([
      getKPIData(startDate, endDate),
      getSalesTrend(startDate, endDate, period),
      getMostViewedProducts(startDate, endDate, 4), 
      getBestSellingProducts(startDate, endDate, 3), 
      getHighlyRatedProducts(startDate, endDate, 3), 
      getProductsNeedingAttention(startDate, endDate, 3) 
    ]);

    const analyticsData = {
      period,
      dateRange,
      kpi,
      salesTrend,
      mostViewed,
      bestSelling,
      highlyRated,
      needsAttention
    };

    analyticsData.kpi.liveVisitors.value = await User.countDocuments({
  lastActive: {
    $gte: new Date(Date.now() - 2 * 60 * 1000)
  },
  isActive: true
});

   const cachedAnalytics = {
  ...analyticsData,
  kpi: {
    ...analyticsData.kpi,
    liveVisitors: {
      value: 0,
      change: 0
    }
  }
};

await redisManager.set(cacheKey, cachedAnalytics, 300);

    res.json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.clearAnalyticsCache = async (req, res) => {
  try {
    await redisManager.delPattern('analytics:*');
    res.json({
      success: true,
      message: 'Analytics cache cleared successfully'
    });
  } catch (error) {
    console.error('Clear analytics cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear analytics cache'
    });
  }
};

module.exports = {
  getAnalytics: exports.getAnalytics,
  clearAnalyticsCache: exports.clearAnalyticsCache,
  getDashboardStats: exports.getDashboardStats
};