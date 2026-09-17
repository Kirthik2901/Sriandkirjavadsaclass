const express = require('express');
const router = express.Router();
const { protect, admin, superAdmin } = require('../../middlewares/authMiddleware');
const userController = require('../../controllers/userController');

router.get('/', protect, superAdmin, userController.getAllUsers);
router.get('/:id', protect, admin, userController.getUserDetails);
router.put('/:id/role', protect, superAdmin, userController.updateUserRole);
router.delete('/:id', protect, superAdmin, userController.deleteUser);

module.exports = router;