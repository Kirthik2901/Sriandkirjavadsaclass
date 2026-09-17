const express = require('express');
const BannerController = require('../../controllers/admin/bannerController');
const { protect, admin } = require('../../middlewares/authMiddleware');
const { rateLimits } = require('../../middlewares/security');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/videos');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: fileFilter
});


router.get('/active', BannerController.getActiveBanners);

router.post('/:id/analytics', BannerController.trackBannerAnalytics);

router.use(protect, admin);

router.get('/', BannerController.getAllBanners);
router.get('/:id', BannerController.getBannerById);
router.post('/', rateLimits.upload, upload.fields([{ name: 'video', maxCount: 1 }]), BannerController.createBanner);
router.put('/:id', rateLimits.upload, upload.fields([{ name: 'video', maxCount: 1 }]), BannerController.updateBanner);
router.delete('/:id', BannerController.deleteBanner);

module.exports = router;