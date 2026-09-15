const express = require('express');
const router = express.Router();
const replacementController = require('../controllers/replacementController');
const { protect } = require('../middlewares/authMiddleware');
const { handleVideoUpload } = require('../middlewares/replacementUpload');

router.get('/', protect, replacementController.getMyReplacementRequests);
router.post('/:orderId', protect, handleVideoUpload, replacementController.createReplacementRequest);

module.exports = router;
