const express = require('express');
const HeaderOfferController = require('../../controllers/admin/headerofferController');
const { protect, superAdmin } = require('../../middlewares/authMiddleware');

const router = express.Router();

router.get('/active', HeaderOfferController.getActiveOffer);

router.get('/current', protect, superAdmin, HeaderOfferController.getCurrentOffer);
router.post('/', protect, superAdmin, HeaderOfferController.createOrUpdateOffer);

module.exports = router;