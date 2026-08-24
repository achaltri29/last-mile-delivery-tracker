const Order = require('../models/Order');
const User = require('../models/User');
const Zone = require('../models/Zone');
const TrackingHistory = require('../models/TrackingHistory');
const RateCard = require('../models/RateCard');
const RateEngine = require('../services/RateEngine');
const AutoAssignmentService = require('../services/AutoAssignmentService');
const OrderStatusService = require('../services/OrderStatusService');

// Helper to generate a unique order number
const generateOrderNumber = () => {
  return 'DEL-' + Date.now() + Math.floor(Math.random() * 1000);
};

/**
 * @desc    Get order rate calculation preview (already implemented in Phase 3)
 * @route   POST /api/orders/calculate-rate
 * @access  Public
 */
const calculateRatePreview = async (req, res) => {
  try {
    const {
      pickupAddress,
      dropAddress,
      dimensions,
      actualWeight,
      orderType,
      paymentType
    } = req.body;

    if (!pickupAddress || !pickupAddress.pincode) {
      return res.status(400).json({ success: false, message: 'Pickup address pincode is required.' });
    }

    if (!dropAddress || !dropAddress.pincode) {
      return res.status(400).json({ success: false, message: 'Drop address pincode is required.' });
    }

    const pricingResult = await RateEngine.calculateCharge({
      pickupPincode: pickupAddress.pincode,
      dropPincode: dropAddress.pincode,
      dimensions,
      actualWeight,
      orderType,
      paymentType
    });

    return res.status(200).json({
      success: true,
      data: pricingResult
    });

  } catch (error) {
    console.error('Pricing preview error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Create a new order and trigger auto-assignment
 * @route   POST /api/orders
 * @access  Private (Customer / Admin)
 */
const createOrder = async (req, res) => {
  try {
    const {
      pickupAddress,
      dropAddress,
      dimensions,
      actualWeight,
      orderType,
      paymentType,
      customerId // Admin can provide customer id
    } = req.body;

    // 1. Basic validation of address fields
    if (!pickupAddress || !pickupAddress.streetAddress || !pickupAddress.area || !pickupAddress.city || !pickupAddress.state || !pickupAddress.pincode) {
      return res.status(400).json({ success: false, message: 'Complete pickup address with streetAddress, area, city, state, and pincode is required.' });
    }

    if (!dropAddress || !dropAddress.streetAddress || !dropAddress.area || !dropAddress.city || !dropAddress.state || !dropAddress.pincode) {
      return res.status(400).json({ success: false, message: 'Complete drop address with streetAddress, area, city, state, and pincode is required.' });
    }

    // Determine target customer
    let targetCustomerId = req.user._id;
    if (req.user.role === 'admin' && customerId) {
      targetCustomerId = customerId;
    }

    // 2. Perform zone detection and pricing calculation
    const pricing = await RateEngine.calculateCharge({
      pickupPincode: pickupAddress.pincode,
      dropPincode: dropAddress.pincode,
      dimensions,
      actualWeight,
      orderType,
      paymentType
    });

    // 3. Generate unique order number
    const orderNumber = generateOrderNumber();

    // 4. Save order in 'Pending' state
    const order = await Order.create({
      orderNumber,
      customer: targetCustomerId,
      pickupAddress,
      dropAddress,
      pickupZone: pricing.pickupZone.id,
      dropZone: pricing.dropZone.id,
      zoneType: pricing.zoneType,
      dimensions,
      actualWeight,
      volumetricWeight: pricing.volumetricWeight,
      billableWeight: pricing.billableWeight,
      orderType,
      paymentType,
      deliveryCharge: pricing.deliveryCharge,
      status: 'Pending'
    });

    // Create initial tracking entry for creation
    await TrackingHistory.create({
      orderId: order._id,
      previousStatus: null,
      newStatus: 'Pending',
      actor: {
        userId: req.user._id,
        role: req.user.role,
        name: req.user.name
      },
      remarks: 'Order placed'
    });

    // 5. Trigger immediate deterministic agent auto-assignment
    const selectedAgent = await AutoAssignmentService.assignAgent(order);

    let updatedOrder;
    if (selectedAgent) {
      updatedOrder = await OrderStatusService.changeStatus(
        order._id,
        'Assigned',
        { id: null, role: 'system', name: 'System' },
        'Automated agent assignment',
        selectedAgent._id
      );
    } else {
      updatedOrder = await OrderStatusService.changeStatus(
        order._id,
        'Pending Assignment',
        { id: null, role: 'system', name: 'System' },
        'No eligible agent available in pickup zone'
      );
    }

    // Populate references before returning
    const finalOrder = await Order.findById(updatedOrder._id)
      .populate('customer', 'name email phone')
      .populate('deliveryAgent', 'name email phone agentMetadata')
      .populate('pickupZone', 'name')
      .populate('dropZone', 'name');

    return res.status(201).json({
      success: true,
      data: finalOrder
    });

  } catch (error) {
    console.error('Order creation error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    List orders with role-based filtering
 * @route   GET /api/orders
 * @access  Private (Customer / Agent / Admin)
 */
const getOrders = async (req, res) => {
  try {
    let query = {};

    // Role filtering
    if (req.user.role === 'customer') {
      query.customer = req.user._id;
    } else if (req.user.role === 'agent') {
      query.deliveryAgent = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admin query filters
      const { status, zone, agent } = req.query;
      if (status) {
        query.status = status;
      }
      if (agent) {
        query.deliveryAgent = agent;
      }
      if (zone) {
        // Can filter by pickupZone or dropZone ID
        query.$or = [{ pickupZone: zone }, { dropZone: zone }];
      }
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('deliveryAgent', 'name email phone agentMetadata')
      .populate('pickupZone', 'name')
      .populate('dropZone', 'name')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (error) {
    console.error('List orders error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error listing orders.' });
  }
};

/**
 * @desc    Get order detail and history timeline
 * @route   GET /api/orders/:id
 * @access  Private (Customer / Agent / Admin)
 */
const getOrderDetail = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('deliveryAgent', 'name email phone agentMetadata')
      .populate('pickupZone', 'name')
      .populate('dropZone', 'name');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Role-based auth authorization
    if (req.user.role === 'customer' && order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: not your order' });
    }

    if (req.user.role === 'agent' && (!order.deliveryAgent || order.deliveryAgent._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ success: false, message: 'Access denied: not your assigned order' });
    }

    // Fetch chronological tracking timeline
    const timeline = await TrackingHistory.find({ orderId: order._id }).sort({ timestamp: 1 });

    return res.status(200).json({
      success: true,
      data: {
        order,
        timeline
      }
    });

  } catch (error) {
    console.error('Order detail error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error retrieving order detail.' });
  }
};

/**
 * @desc    Update order status
 * @route   PATCH /api/orders/:id/status
 * @access  Private (Agent / Admin)
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Target status is required' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Agent validation: can only update their assigned orders
    if (req.user.role === 'agent' && (!order.deliveryAgent || order.deliveryAgent.toString() !== req.user._id.toString())) {
      return res.status(403).json({ success: false, message: 'Access denied: order not assigned to you' });
    }



    // Perform transition using OrderStatusService
    const updatedOrder = await OrderStatusService.changeStatus(
      order._id,
      status,
      { id: req.user._id, role: req.user.role, name: req.user.name },
      remarks
    );

    const populatedOrder = await Order.findById(updatedOrder._id)
      .populate('customer', 'name email phone')
      .populate('deliveryAgent', 'name email phone agentMetadata')
      .populate('pickupZone', 'name')
      .populate('dropZone', 'name');

    return res.status(200).json({
      success: true,
      data: populatedOrder
    });

  } catch (error) {
    console.error('Update status error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Manually assign an agent to an order (Admin only)
 * @route   POST /api/orders/:id/assign
 * @access  Private (Admin only)
 */
const manualAssignAgent = async (req, res) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Agent ID is required.' });
    }

    // Validate the target user is indeed an agent
    const agent = await User.findById(agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(400).json({ success: false, message: 'Target user is not a delivery agent.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Manually assign using OrderStatusService to handle transition and workload updates
    const updatedOrder = await OrderStatusService.changeStatus(
      order._id,
      'Assigned',
      { id: req.user._id, role: req.user.role, name: req.user.name },
      `Manually assigned to agent ${agent.name} by Admin`,
      agentId
    );

    const populatedOrder = await Order.findById(updatedOrder._id)
      .populate('customer', 'name email phone')
      .populate('deliveryAgent', 'name email phone agentMetadata')
      .populate('pickupZone', 'name')
      .populate('dropZone', 'name');

    return res.status(200).json({
      success: true,
      data: populatedOrder
    });

  } catch (error) {
    console.error('Manual assign error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};


/**
 * @desc    Reschedule a failed order
 * @route   POST /api/orders/:id/reschedule
 * @access  Private (Customer / Admin)
 */
const rescheduleOrder = async (req, res) => {
  try {
    const { rescheduledDate } = req.body;

    if (!rescheduledDate) {
      return res.status(400).json({ success: false, message: 'Rescheduled date is required.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Customer authorization: must be their own order
    if (req.user.role === 'customer' && order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: not your order' });
    }

    // Verify order status is Failed
    if (order.status !== 'Failed') {
      return res.status(400).json({ success: false, message: 'Only failed orders can be rescheduled.' });
    }

    // 1. Record the rescheduled date on the last failed attempt subdocument
    const lastAttempt = order.attempts[order.attempts.length - 1];
    if (lastAttempt && lastAttempt.status === 'Failed') {
      lastAttempt.rescheduledDate = new Date(rescheduledDate);
    } else {
      return res.status(400).json({ success: false, message: 'No failed physical attempt found to reschedule.' });
    }

    // 2. Save intermediate state to persist the rescheduling details
    await order.save();

    // 3. Transition to 'Rescheduled' using OrderStatusService (releases agent and updates timeline)
    let updatedOrder = await OrderStatusService.changeStatus(
      order._id,
      'Rescheduled',
      { id: req.user._id, role: req.user.role, name: req.user.name },
      `Delivery rescheduled to ${new Date(rescheduledDate).toLocaleDateString()}`
    );

    // 4. Transition from Rescheduled to Pending Assignment
    updatedOrder = await OrderStatusService.changeStatus(
      order._id,
      'Pending Assignment',
      { id: null, role: 'system', name: 'System' },
      'Triggering auto-assignment for rescheduled attempt'
    );

    // 5. Attempt deterministic agent auto-reassignment
    const selectedAgent = await AutoAssignmentService.assignAgent(updatedOrder);
    if (selectedAgent) {
      updatedOrder = await OrderStatusService.changeStatus(
        updatedOrder._id,
        'Assigned',
        { id: null, role: 'system', name: 'System' },
        'Automated agent assignment for rescheduled attempt',
        selectedAgent._id
      );
    }

    const populatedOrder = await Order.findById(updatedOrder._id)
      .populate('customer', 'name email phone')
      .populate('deliveryAgent', 'name email phone agentMetadata')
      .populate('pickupZone', 'name')
      .populate('dropZone', 'name');

    return res.status(200).json({
      success: true,
      data: populatedOrder
    });

  } catch (error) {
    console.error('Reschedule order error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get all delivery agents (for manual admin assignment selection)
 * @route   GET /api/orders/agents
 * @access  Private (Admin)
 */
const getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent' });
    return res.status(200).json({ success: true, data: agents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all configured zones (for admin listing)
 * @route   GET /api/orders/metadata/zones
 * @access  Private (Admin)
 */
const getZones = async (req, res) => {
  try {
    const zones = await Zone.find({});
    return res.status(200).json({ success: true, data: zones });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all configured rates (for admin listing)
 * @route   GET /api/orders/metadata/rates
 * @access  Private (Admin)
 */
const getRates = async (req, res) => {
  try {
    const rates = await RateCard.find({});
    return res.status(200).json({ success: true, data: rates });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new delivery zone
 * @route   POST /api/orders/zones
 * @access  Private (Admin)
 */
const createZone = async (req, res) => {
  try {
    const { name, pincodes, description } = req.body;

    if (!name || !pincodes || !Array.isArray(pincodes) || pincodes.length === 0) {
      return res.status(400).json({ success: false, message: 'Zone name and a non-empty list of pincodes are required.' });
    }

    const cleanPincodes = pincodes.map(p => p.toString().trim());

    // Check duplicate name
    const existingZoneName = await Zone.findOne({ name: name.trim() });
    if (existingZoneName) {
      return res.status(400).json({ success: false, message: `Zone name '${name}' already exists.` });
    }

    // Check if any pincode is already mapped to another zone
    const duplicatePincodeZone = await Zone.findOne({ pincodes: { $in: cleanPincodes } });
    if (duplicatePincodeZone) {
      return res.status(400).json({ success: false, message: `One or more pincodes are already mapped to zone: ${duplicatePincodeZone.name}` });
    }

    const newZone = await Zone.create({
      name: name.trim(),
      pincodes: cleanPincodes,
      description: description ? description.trim() : ''
    });

    return res.status(201).json({ success: true, data: newZone });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update zone and pincodes configuration
 * @route   PUT /api/orders/zones/:id
 * @access  Private (Admin)
 */
const updateZone = async (req, res) => {
  try {
    const { name, pincodes, description } = req.body;
    const zoneId = req.params.id;

    if (!name || !pincodes || !Array.isArray(pincodes) || pincodes.length === 0) {
      return res.status(400).json({ success: false, message: 'Zone name and a non-empty list of pincodes are required.' });
    }

    const cleanPincodes = pincodes.map(p => p.toString().trim());

    const zone = await Zone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone not found.' });
    }

    // Check duplicate name in other zones
    const existingZoneName = await Zone.findOne({ _id: { $ne: zoneId }, name: name.trim() });
    if (existingZoneName) {
      return res.status(400).json({ success: false, message: `Zone name '${name}' is already used by another zone.` });
    }

    // Check duplicate pincodes in other zones
    const duplicatePincodeZone = await Zone.findOne({ _id: { $ne: zoneId }, pincodes: { $in: cleanPincodes } });
    if (duplicatePincodeZone) {
      return res.status(400).json({ success: false, message: `One or more pincodes are already mapped to another zone: ${duplicatePincodeZone.name}` });
    }

    // Safety check: Pincode removal check against active orders
    const removedPincodes = zone.pincodes.filter(p => !cleanPincodes.includes(p));
    if (removedPincodes.length > 0) {
      const activeOrders = await Order.findOne({
        status: { $nin: ['Delivered', 'Failed'] },
        $or: [
          { 'pickupAddress.pincode': { $in: removedPincodes } },
          { 'dropAddress.pincode': { $in: removedPincodes } }
        ]
      });
      if (activeOrders) {
        return res.status(400).json({ success: false, message: 'Cannot remove pincodes: active orders are currently booked under pincode(s) being removed.' });
      }
    }

    zone.name = name.trim();
    zone.pincodes = cleanPincodes;
    zone.description = description ? description.trim() : '';
    await zone.save();

    return res.status(200).json({ success: true, data: zone });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete a zone safely
 * @route   DELETE /api/orders/zones/:id
 * @access  Private (Admin)
 */
const deleteZone = async (req, res) => {
  try {
    const zoneId = req.params.id;
    const zone = await Zone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone not found.' });
    }

    // Safety check: Active orders using this zone
    const activeOrders = await Order.findOne({
      status: { $nin: ['Delivered', 'Failed'] },
      $or: [
        { pickupZone: zoneId },
        { dropZone: zoneId }
      ]
    });
    if (activeOrders) {
      return res.status(400).json({ success: false, message: 'Cannot delete zone: active orders are currently assigned to this zone.' });
    }

    await Zone.deleteOne({ _id: zoneId });
    return res.status(200).json({ success: true, message: 'Zone deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update pricing rate configuration
 * @route   PUT /api/orders/rates/:id
 * @access  Private (Admin)
 */
const updateRateCard = async (req, res) => {
  try {
    const { baseWeight, baseRate, perKgRate, codSurcharge } = req.body;
    const rateCardId = req.params.id;

    if (
      baseWeight === undefined || isNaN(Number(baseWeight)) || Number(baseWeight) < 0 ||
      baseRate === undefined || isNaN(Number(baseRate)) || Number(baseRate) < 0 ||
      perKgRate === undefined || isNaN(Number(perKgRate)) || Number(perKgRate) < 0 ||
      codSurcharge === undefined || isNaN(Number(codSurcharge)) || Number(codSurcharge) < 0
    ) {
      return res.status(400).json({ success: false, message: 'All rate parameters must be valid non-negative numbers.' });
    }

    const rateCard = await RateCard.findById(rateCardId);
    if (!rateCard) {
      return res.status(404).json({ success: false, message: 'Rate card not found.' });
    }

    rateCard.baseWeight = Number(baseWeight);
    rateCard.baseRate = Number(baseRate);
    rateCard.perKgRate = Number(perKgRate);
    rateCard.codSurcharge = Number(codSurcharge);
    await rateCard.save();

    return res.status(200).json({ success: true, data: rateCard });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};
