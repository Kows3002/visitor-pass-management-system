const router = require('express').Router();
const { param } = require('express-validator');
const validate = require('../middleware/validate');
const controller = require('../controllers/passController');
router.get('/verify/:code', [param('code').isHexadecimal().isLength({ min: 48, max: 48 })], validate, controller.verify);
module.exports = router;
