const router = require('express').Router();
const { body } = require('express-validator');
const controller = require('../controllers/settingController');
const validate = require('../middleware/validate');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);
router.get('/', controller.get);
router.put('/', authorizeRoles('administrator'), [
  body('meetingDurationMinutes').optional().isInt({ min: 15, max: 480 }),
  body('companyName').optional().trim().isLength({ min: 2, max: 120 }),
  body('receptionPhone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
  body('receptionEmail').optional({ checkFalsy: true }).trim().normalizeEmail().isEmail(),
], validate, controller.update);

module.exports = router;
