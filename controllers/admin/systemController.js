const SystemSettings = require('../../models/systemSetting');
const redisManager = require('../../config/redis');
const { validationResult } = require('express-validator');

class SystemController {      
  
  static async getSystemSettings(req, res) {
    try {
      const { category = '' } = req.query;
      const cacheKey = `system:settings:${category}`;
      
      const cachedData = await redisManager.get(cacheKey);
      if (cachedData) {
        return res.json({ success: true, data: cachedData, cached: true });
      }

      const query = category ? { category } : {};
      const settings = await SystemSettings.find(query)
        .populate('updatedBy', 'username email')
        .sort({ category: 1, key: 1 });

      
      const groupedSettings = settings.reduce((acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        acc[setting.category].push(setting);
        return acc;
      }, {});

      await redisManager.set(cacheKey, groupedSettings, 1800);
      res.json({ success: true, data: groupedSettings });
    } catch (error) {
      console.error('Get system settings error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch system settings' });
    }
  }

  
  static async updateSystemSetting(req, res) {
    try {
      const { category, key } = req.params;
      const { value, label, description, type, isPublic } = req.body;

      let setting = await SystemSettings.findOne({ category, key });
      
      if (setting) {
        setting.value = value;
        setting.label = label || setting.label;
        setting.description = description || setting.description;
        setting.type = type || setting.type;
        setting.isPublic = isPublic !== undefined ? isPublic : setting.isPublic;
        setting.updatedBy = req.user.id;
        await setting.save();
      } else {
        setting = new SystemSettings({
          category,
          key,
          value,
          label,
          description,
          type: type || 'string',
          isPublic: isPublic || false,
          updatedBy: req.user.id
        });
        await setting.save();
      }

      await setting.populate('updatedBy', 'username email');
      await redisManager.delPattern('system:*');

      res.json({
        success: true,
        message: 'System setting updated successfully',
        data: setting
      });
    } catch (error) {
      console.error('Update system setting error:', error);
      res.status(500).json({ success: false, message: 'Failed to update system setting' });
    }
  }

  
  static async getPublicSettings(req, res) {
    try {
      const cacheKey = 'system:public-settings';
      const cachedData = await redisManager.get(cacheKey);
      
      if (cachedData) {
        return res.json({ success: true, data: cachedData, cached: true });
      }

      const settings = await SystemSettings.find({ isPublic: true })
        .select('category key value type')
        .lean();

      const publicSettings = settings.reduce((acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = {};
        }
        acc[setting.category][setting.key] = setting.value;
        return acc;
      }, {});

      await redisManager.set(cacheKey, publicSettings, 3600);
      res.json({ success: true, data: publicSettings });
    } catch (error) {
      console.error('Get public settings error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch public settings' });
    }
  }

  
  static async clearCache(req, res) {
    try {
      const { pattern = '*' } = req.body;
      
      await redisManager.delPattern(`cache:${pattern}`);
      await redisManager.delPattern(`user:${pattern}`);
      
      res.json({
        success: true,
        message: `Cache cleared for pattern: ${pattern}`
      });
    } catch (error) {
      console.error('Clear cache error:', error);
      res.status(500).json({ success: false, message: 'Failed to clear cache' });
    }
  }
}

module.exports = SystemController;