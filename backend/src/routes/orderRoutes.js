const express = require('express');
const router = express.Router();
const {
  calculateRatePreview,
  createOrder,
  getOrders,
  getOrderDetail,
  updateOrderStatus,
  manualAssignAgent,
  rescheduleOrder,
  getAgents,
  getZones,
  getRates,
  createZone,
  updateZone,
  deleteZone,
  updateRateCard
} = require('../controllers/orderController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// Public route
router.post('/calculate-rate', calculateRatePreview);

// Authenticated routes
router.use(authenticate);

// Create and List
router.post('/', authorizeRoles('customer', 'admin'), createOrder);
router.get('/', authorizeRoles('customer', 'agent', 'admin'), getOrders);

router.get('/agents', authorizeRoles('admin'), getAgents);
router.get('/metadata/zones', authorizeRoles('admin'), getZones);
router.get('/metadata/rates', authorizeRoles('admin'), getRates);

// Zone & Rate Configuration CRUD (Admin only)
router.post('/zones', authorizeRoles('admin'), createZone);
router.put('/zones/:id', authorizeRoles('admin'), updateZone);
router.delete('/zones/:id', authorizeRoles('admin'), deleteZone);
router.put('/rates/:id', authorizeRoles('admin'), updateRateCard);

// Retrieve, Status change, and Assignment
router.get('/:id', authorizeRoles('customer', 'agent', 'admin'), getOrderDetail);
router.patch('/:id/status', authorizeRoles('agent', 'admin'), updateOrderStatus);
router.post('/:id/assign', authorizeRoles('admin'), manualAssignAgent);
router.post('/:id/reschedule', authorizeRoles('customer', 'admin'), rescheduleOrder);

module.exports = router;
