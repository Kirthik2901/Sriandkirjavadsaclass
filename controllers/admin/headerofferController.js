const HeaderOffer = require('../../models/headerOffer');
const redisManager = require('../../config/redis');

class HeaderOfferController {
  static async getActiveOffer(req, res) {
    try {
      const cacheKey = 'header-offers:active';
      
      const cachedData = await redisManager.get(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }

      const now = new Date();
      const offer = await HeaderOffer.findOne({
        status: 'active',
        $or: [
          { startDate: { $lte: now }, endDate: { $gte: now } },
          { startDate: { $lte: now }, endDate: null },
          { startDate: null, endDate: null }
        ]
      }).select('-createdBy -__v');

      if (offer) {
        await redisManager.set(cacheKey, offer, 300);
      }

      res.json({
        success: true,
        data: offer
      });
    } catch (error) {
      console.error('Get active offer error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active offer'
      });
    }
  }

  static async getCurrentOffer(req, res) {
    try {
      const offer = await HeaderOffer.findOne()
        .sort({ updatedAt: -1 })
        .populate('createdBy', 'username email');

      res.json({
        success: true,
        data: offer
      });
    } catch (error) {
      console.error('Get current offer error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch offer'
      });
    }
  }

  static async createOrUpdateOffer(req, res) {
    try {
      const offerData = {
        ...req.body,
        createdBy: req.user.id
      };

      
      const existingOffer = await HeaderOffer.findOne().sort({ updatedAt: -1 });

      let offer;
      if (existingOffer) {
        offer = await HeaderOffer.findByIdAndUpdate(
          existingOffer._id,
          offerData,
          { new: true, runValidators: true }
        ).populate('createdBy', 'username email');
      } else {
        offer = new HeaderOffer(offerData);
        await offer.save();
        await offer.populate('createdBy', 'username email');
      }

      await redisManager.delPattern('header-offers:*');

      res.status(existingOffer ? 200 : 201).json({
        success: true,
        message: existingOffer ? 'Offer updated successfully' : 'Offer created successfully',
        data: offer
      });
    } catch (error) {
      console.error('Save offer error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to save offer'
      });
    }
  }
}

module.exports = HeaderOfferController;