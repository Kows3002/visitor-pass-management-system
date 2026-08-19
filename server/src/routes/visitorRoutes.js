const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/visitorController');
const bulk = require('../controllers/bulkVisitorController');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

const statuses = ['pending', 'approved', 'rejected', 'cancelled', 'checked_in', 'checked_out'];
const sorts = ['visitorName', 'visitDate', 'expectedArrival', 'status', 'createdAt'];
const id = [param('id').isMongoId().withMessage('A valid visitor identifier is required')];
const listValidation = [
  query('search').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  query('status').optional({ checkFalsy: true }).isIn(statuses),
  query('department').optional({ checkFalsy: true }).isMongoId(),
  query('employee').optional({ checkFalsy: true }).isMongoId(),
  query('from').optional({ checkFalsy: true }).isISO8601({ strict: true }),
  query('to').optional({ checkFalsy: true }).isISO8601({ strict: true }).custom((value, { req }) => {
    if (req.query.from && value < req.query.from) throw new Error('End date must not be before start date');
    return true;
  }),
  query('active').optional({ checkFalsy: true }).isBoolean(),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }),
  query('sortBy').optional({ checkFalsy: true }).isIn(sorts),
  query('sortOrder').optional({ checkFalsy: true }).isIn(['asc', 'desc']),
];

router.use(authenticateUser);
router.get('/', listValidation, validate, controller.list);
router.post('/bulk/approve', authorizeRoles('administrator'), [body('ids').isArray({ min: 1, max: 50 }), body('ids.*').isMongoId(), body('remarks').optional({ checkFalsy: true }).trim().isLength({ max: 1000 })], validate, bulk.approve);
router.post('/bulk/export', authorizeRoles('administrator'), [body('ids').isArray({ min: 1, max: 500 }), body('ids.*').isMongoId()], validate, bulk.exportExcel);
router.get('/:id', id, validate, controller.detail);
router.get('/:id/history', id, validate, controller.history);
router.post('/', authorizeRoles('receptionist', 'administrator'), upload.single('photo'), [
  body('visitorName').trim().isLength({ min: 2, max: 100 }),
  body('phone').trim().isMobilePhone('any'),
  body('email').optional({ checkFalsy: true }).trim().normalizeEmail().isEmail(),
  body('companyName').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  body('governmentId').trim().isLength({ min: 3, max: 100 }),
  body('purpose').trim().isLength({ min: 3, max: 300 }),
  body('visitDate').isISO8601({ strict: true }),
  body('expectedArrival').matches(/^([01]\d|2[0-3]):[0-5]\d$/),
], validate, controller.create);
router.get('/:id/pass', id, validate, controller.pass);
router.get('/:id/pass/pdf', id, validate, controller.passPdf);
router.post('/:id/arrival', authorizeRoles('receptionist'), [...id, body('status').isIn(['arrived', 'not_arrived'])], validate, controller.confirmArrival);
router.post('/:id/next-visit', authorizeRoles('employee', 'administrator'), [...id, body('nextVisitDate').isISO8601({ strict: true })], validate, controller.setNextVisit);
router.post('/:id/remarks', authorizeRoles('employee', 'administrator'), [...id, body('remarks').trim().isLength({ min: 2, max: 1000 })], validate, controller.remark);
router.post('/:id/approve', authorizeRoles('employee', 'administrator'), [...id, body('remarks').optional({ checkFalsy: true }).trim().isLength({ max: 1000 })], validate, controller.action('approve'));
router.post('/:id/reject', authorizeRoles('employee', 'administrator'), [...id, body('remarks').trim().isLength({ min: 2, max: 1000 })], validate, controller.action('reject'));
router.post('/:id/cancel', authorizeRoles('receptionist', 'administrator'), [...id, body('remarks').trim().isLength({ min: 2, max: 1000 })], validate, controller.action('cancel'));
router.post('/:id/checkin', authorizeRoles('receptionist'), id, validate, controller.action('checkin'));
router.post('/:id/checkout', authorizeRoles('receptionist'), id, validate, controller.action('checkout'));

module.exports = router;
