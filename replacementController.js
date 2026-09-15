const fs = require('fs-extra');
const path = require('path');
const Order = require('../models/order');
const ReplacementRequest = require('../models/replacementRequest');

const VALID_REASONS = ['DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'QUALITY_ISSUE', 'OTHER'];
const REPLACEMENT_WINDOW_DAYS = 3;

/**
 * Confirms an image URL was served by our configured ImageKit endpoint.
 *
 * @param {string} url - Candidate image URL from the client.
 * @returns {boolean} True when the URL belongs to our ImageKit endpoint.
 */
const isOwnImageKitUrl = (url) => {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  if (!endpoint || typeof url !== 'string') {
    return false;
  }
  return url.trim().startsWith(endpoint.replace(/\/+$/, ''));
};

/**
 * Parses the photos payload (JSON string or array) into validated ImageKit references.
 *
 * @param {unknown} rawPhotos - photos field from the request body.
 * @returns {{ photos: Array<{url: string, fileId?: string}>, error?: string }} Parsed photos or an error.
 */
const parsePhotos = (rawPhotos) => {
  if (!rawPhotos) {
    return { photos: [] };
  }

  let list = rawPhotos;
  if (typeof rawPhotos === 'string') {
    try {
      list = JSON.parse(rawPhotos);
    } catch (e) {
      return { photos: [], error: 'Invalid photos payload' };
    }
  }

  if (!Array.isArray(list)) {
    return { photos: [], error: 'Photos must be an array' };
  }

  const photos = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !item.url) {
      return { photos: [], error: 'Each photo requires a url' };
    }
    if (!isOwnImageKitUrl(item.url)) {
      return { photos: [], error: 'Photo URL is not from an allowed image source' };
    }
    photos.push({ url: item.url.trim(), fileId: item.fileId });
  }

  return { photos };
};

/**
 * Removes an uploaded video file when the request is rejected during validation.
 *
 * @param {Express.Multer.File|undefined} file - Multer file, if any.
 */
const cleanupVideo = async (file) => {
  if (file && file.path) {
    await fs.remove(file.path).catch(() => {});
  }
};

/**
 * Creates a product replacement request for a delivered order owned by the customer.
 * POST /api/replacements/:orderId
 */
exports.createReplacementRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, reason, reasonText } = req.body;

    const order = await Order.findById(orderId);
    if (!order || order.user.toString() !== req.user.id) {
      await cleanupVideo(req.file);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (String(order.status).toLowerCase() !== 'delivered') {
      await cleanupVideo(req.file);
      return res.status(400).json({ success: false, message: 'Order not delivered' });
    }

    const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt) : null;
    const daysSinceDelivery = deliveredAt
      ? Math.floor((Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24))
      : Number.MAX_SAFE_INTEGER;

    if (daysSinceDelivery > REPLACEMENT_WINDOW_DAYS) {
      await cleanupVideo(req.file);
      return res.status(400).json({ success: false, message: 'Replacement period expired' });
    }

    if (!VALID_REASONS.includes(reason)) {
      await cleanupVideo(req.file);
      return res.status(400).json({ success: false, message: 'Invalid replacement reason' });
    }

    if (reason === 'OTHER' && (!reasonText || !reasonText.trim())) {
      await cleanupVideo(req.file);
      return res.status(400).json({ success: false, message: 'reasonText is required when reason is OTHER' });
    }

    const { photos, error: photoError } = parsePhotos(req.body.photos);
    if (photoError) {
      await cleanupVideo(req.file);
      return res.status(400).json({ success: false, message: photoError });
    }

    const existing = await ReplacementRequest.findOne({
      order: order._id,
      status: { $in: ['PENDING', 'APPROVED'] }
    });
    if (existing) {
      await cleanupVideo(req.file);
      return res.status(400).json({ success: false, message: 'A replacement request already exists for this order' });
    }

    const requestData = {
      order: order._id,
      productId: productId || undefined,
      user: req.user.id,
      reason,
      reasonText: reason === 'OTHER' ? reasonText.trim() : undefined,
      photos,
      status: 'PENDING'
    };

    if (req.file) {
      requestData.video = {
        storagePath: path.resolve(req.file.path),
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        downloadCount: 0
      };
    }

    const replacementRequest = await ReplacementRequest.create(requestData);

    const safe = replacementRequest.toObject();
    if (safe.video) {
      delete safe.video.storagePath;
    }

    return res.status(201).json({
      success: true,
      message: 'Replacement request submitted',
      data: safe
    });
  } catch (error) {
    await cleanupVideo(req.file);
    console.error('Create replacement request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create replacement request' });
  }
};

/**
 * Lists the authenticated customer's own replacement requests.
 * GET /api/replacements
 */
exports.getMyReplacementRequests = async (req, res) => {
  try {
    const requests = await ReplacementRequest.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .populate('order', 'orderNumber status totalAmount');

    return res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Get my replacement requests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch replacement requests' });
  }
};
