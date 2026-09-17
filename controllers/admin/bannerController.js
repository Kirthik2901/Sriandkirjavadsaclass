const Banner = require('../../models/banner');
const redisManager = require('../../config/redis');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const sharp = require('sharp');
const ImageKit = require('imagekit');

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});



class BannerController {
  static async getAllBanners(req, res) {
    try {
      const { page = 1, limit = 20, status = '' } = req.query;

      const cacheKey = `banners:${JSON.stringify(req.query)}`;
      const cachedData = await redisManager.get(cacheKey);
      if (cachedData) {
        return res.json({ success: true, data: cachedData, cached: true });
      }

      const query = {};
      if (status) query.status = status;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [banners, total] = await Promise.all([
        Banner.find(query)
          .populate('createdBy', 'username email')
          .sort({ priority: -1, createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        Banner.countDocuments(query)
      ]);

      const result = {
        banners,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalBanners: total,
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        }
      };

      await redisManager.set(cacheKey, result, 600);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Get banners error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch banners' });
    }
  }

  static async getBannerById(req, res) {
    try {
      const { id } = req.params;
      const banner = await Banner.findById(id).populate('createdBy', 'username email');

      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner not found' });
      }

      res.json({ success: true, data: banner });
    } catch (error) {
      console.error('Get banner error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch banner' });
    }
  }

  static async getActiveBanners(req, res) {
    try {
      const cacheKey = `banners:active:hero`;
      const cachedData = await redisManager.get(cacheKey);
      if (cachedData) {
        return res.json({ success: true, data: cachedData, cached: true });
      }

      const now = new Date();
      const banners = await Banner.find({
        $or: [
          { status: 'active' },
          { 
            status: 'scheduled',
            startDate: { $lte: now },
            $or: [{ endDate: { $gte: now } }, { endDate: null }]
          }
        ]
      })
      .sort({ priority: -1, createdAt: -1 })
      .limit(5)
      .select('image video mediaType link priority analytics');

      await redisManager.set(cacheKey, banners, 300);
      res.json({ success: true, data: banners });
    } catch (error) {
      console.error('Get active banners error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch active banners' });
    }
  }

  static async createBanner(req, res) {
    try {
      
      if (req.body.status === 'active') {
        const activeBannerCount = await Banner.countDocuments({ 
          status: { $in: ['active', 'scheduled'] }
        });

        if (activeBannerCount >= 5) {
          return res.status(400).json({
            success: false,
            message: 'Maximum 5 active/scheduled banners allowed. Please deactivate or delete an existing banner first.'
          });
        }
      }

      const bannerData = {
        priority: req.body.priority,
        status: req.body.status,
        createdBy: req.user.id
      };

      if (req.body.linkUrl) bannerData.link = { url: req.body.linkUrl };
      
      
      if (req.body.status === 'scheduled') {
        if (!req.body.startDate) {
          return res.status(400).json({
            success: false,
            message: 'Start date is required for scheduled banners'
          });
        }
        bannerData.startDate = new Date(req.body.startDate);
        if (req.body.endDate) {
          bannerData.endDate = new Date(req.body.endDate);
        }
      }

      
      if (req.body.mediaType === 'video' && req.files?.video) {
        const videoFile = req.files.video[0];
        if (videoFile.size > 15 * 1024 * 1024) { 
          return res.status(400).json({ 
            success: false, 
            message: 'Video size must be less than 15MB' 
          });
        }
        
        const processedVideo = await BannerController.processVideo(videoFile);
        bannerData.video = processedVideo;
        bannerData.mediaType = 'video';
        bannerData.image = { desktop: { url: '', fileId: '' } };
      } else if (req.body.mediaType === 'image' || !req.body.mediaType) {
        if (!req.body.desktopImageUrl || !req.body.desktopFileId) {
          return res.status(400).json({ 
            success: false, 
            message: 'Desktop image is required' 
          });
        }

        const imageData = {
          desktop: { url: req.body.desktopImageUrl, fileId: req.body.desktopFileId }
        };

        if (req.body.mobileImageUrl && req.body.mobileFileId) {
          imageData.mobile = { url: req.body.mobileImageUrl, fileId: req.body.mobileFileId };
        }

        bannerData.image = imageData;
        bannerData.mediaType = 'image';
      }

      const banner = new Banner(bannerData);
      await banner.save();
      await banner.populate('createdBy', 'username email');
      await redisManager.delPattern('banners:*');

      res.status(201).json({ 
        success: true, 
        message: 'Banner created successfully', 
        data: banner 
      });
    } catch (error) {
      console.error('Create banner error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to create banner' 
      });
    }
  }

  
  static async processVideo(videoFile) {
    return new Promise(async (resolve, reject) => {
      try {
        const baseUrl = process.env.BASE_URL;
        const filename = videoFile.filename;
        const inputPath = videoFile.path;
        
        resolve({
          url: `${baseUrl}/uploads/videos/${filename}`,
          thumbnail: '', 
          filePath: inputPath
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  static async updateBanner(req, res) {
    try {
      const { id } = req.params;
      const existingBanner = await Banner.findById(id);

      if (!existingBanner) {
        return res.status(404).json({ success: false, message: 'Banner not found' });
      }

      const updateData = {
        priority: req.body.priority,
        status: req.body.status
      };

      if (req.body.linkUrl !== undefined) {
        updateData.link = req.body.linkUrl ? { url: req.body.linkUrl } : {};
      }

      
      if (req.body.status === 'scheduled') {
        if (req.body.startDate) {
          updateData.startDate = new Date(req.body.startDate);
        }
        if (req.body.endDate) {
          updateData.endDate = new Date(req.body.endDate);
        }
      } else {
        
        updateData.startDate = null;
        updateData.endDate = null;
      }

      
      if (req.body.mediaType === 'video' && req.files?.video) {
        if (existingBanner.video?.filePath) {
          try {
            await fs.unlink(existingBanner.video.filePath);
            if (existingBanner.video.thumbnail) {
              const thumbPath = existingBanner.video.thumbnail.replace(process.env.BASE_URL , process.cwd());
              await fs.unlink(thumbPath);
            }
          } catch (err) {
            console.error('Error deleting old video:', err);
          }
        }
        
        const videoFile = req.files.video[0];
        const processedVideo = await BannerController.processVideo(videoFile);
        updateData.video = processedVideo;
        updateData.mediaType = 'video';
      } else if (req.body.mediaType === 'image') {
        const imageData = existingBanner.image ? JSON.parse(JSON.stringify(existingBanner.image)) : {};

        if (req.body.desktopImageUrl && req.body.desktopFileId) {
          if (imageData.desktop?.fileId) {
            try {
              await imagekit.deleteFile(imageData.desktop.fileId);
            } catch (err) {
              console.error('Error deleting old image:', err);
            }
          }
          imageData.desktop = {
            url: req.body.desktopImageUrl,
            fileId: req.body.desktopFileId
          };
        }

        if (req.body.mobileImageUrl && req.body.mobileFileId) {
          if (imageData.mobile?.fileId) {
            try {
              await imagekit.deleteFile(imageData.mobile.fileId);
            } catch (err) {
              console.error('Error deleting old image:', err);
            }
          }
          imageData.mobile = {
            url: req.body.mobileImageUrl,
            fileId: req.body.mobileFileId
          };
        }

        updateData.image = imageData;
        updateData.mediaType = 'image';
      }

      const banner = await Banner.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true
      }).populate('createdBy', 'username email');

      await redisManager.delPattern('banners:*');
      res.json({ 
        success: true, 
        message: 'Banner updated successfully', 
        data: banner 
      });
    } catch (error) {
      console.error('Update banner error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to update banner' 
      });
    }
  }

  static async deleteBanner(req, res) {
    try {
      const { id } = req.params;
      const banner = await Banner.findById(id);
      
      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner not found' });
      }

      if (banner.mediaType === 'video' && banner.video) {
        if (banner.video.filePath) {
          try {
            await fs.unlink(banner.video.filePath);
          } catch (err) {
            console.error('Error deleting video:', err);
          }
        }
        if (banner.video.thumbnail) {
          try {
            const thumbPath = banner.video.thumbnail.replace(process.env.BASE_URL , process.cwd());
            await fs.unlink(thumbPath);
          } catch (err) {
            console.error('Error deleting thumbnail:', err);
          }
        }
      } else if (banner.mediaType === 'image' && banner.image) {
        const deletePromises = [];
        
        if (banner.image.desktop?.fileId) {
          deletePromises.push(
            imagekit.deleteFile(banner.image.desktop.fileId).catch(err => 
              console.error('Error deleting desktop image:', err)
            )
          );
        }
        if (banner.image.mobile?.fileId) {
          deletePromises.push(
            imagekit.deleteFile(banner.image.mobile.fileId).catch(err => 
              console.error('Error deleting mobile image:', err)
            )
          );
        }

        await Promise.all(deletePromises);
      }

      await Banner.findByIdAndDelete(id);
      await redisManager.delPattern('banners:*');
      res.json({ success: true, message: 'Banner deleted successfully' });
    } catch (error) {
      console.error('Delete banner error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete banner' });
    }
  }

  
  static async trackBannerAnalytics(req, res) {
    try {
      const { id } = req.params;
      const { action, visitorId } = req.body;
      
      const userIdentifier = visitorId || req.ip || req.connection.remoteAddress || 'unknown';

      const banner = await Banner.findById(id);
      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner not found' });
      }

      let updated = false;

      if (action === 'view') {
        if (!banner.analytics.viewedBy.includes(userIdentifier)) {
          banner.analytics.views += 1;
          banner.analytics.uniqueViews += 1;
          banner.analytics.viewedBy.push(userIdentifier);
          updated = true;
        }
      } else if (action === 'click') {
        if (!banner.analytics.clickedBy.includes(userIdentifier)) {
          banner.analytics.clicks += 1;
          banner.analytics.uniqueClicks += 1;
          banner.analytics.clickedBy.push(userIdentifier);
          updated = true;
        }
      }

      if (updated) {
        if (banner.analytics.uniqueViews > 0) {
          banner.analytics.ctr = parseFloat(
            ((banner.analytics.uniqueClicks / banner.analytics.uniqueViews) * 100).toFixed(2)
          );
        }

        await banner.save();
        await redisManager.delPattern('banners:*');
      }

      res.json({ 
        success: true, 
        message: 'Analytics tracked successfully',
        isUnique: updated
      });
    } catch (error) {
      console.error('Track banner analytics error:', error);
      res.status(500).json({ success: false, message: 'Failed to track analytics' });
    }
  }
}

module.exports = BannerController;