const express = require('express');
const router = express.Router();
const TagController = require('../../controllers/admin/tagController');
const { protect, admin, systemAdmin } = require('../../middlewares/authMiddleware');


router.get('/', TagController.getAllTags);
router.get('/:id/stats', TagController.getTagStats);
router.get('/:id', TagController.getTagById);


router.post('/', protect, admin, TagController.createTag);
router.put('/:id', protect, admin, TagController.updateTag);
router.delete('/:id', protect, systemAdmin, TagController.deleteTag);

module.exports = router;