const path = require('path');
// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
jest.setTimeout(30000);

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Zone = require('../src/models/Zone');
const RateCard = require('../src/models/RateCard');
const Order = require('../src/models/Order');
const TrackingHistory = require('../src/models/TrackingHistory');
const NotificationService = require('../src/services/NotificationService');

const TEST_DB_URI = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace(/\/unthinkable_delivery([?]?)/, '/unthinkable_delivery_test$1')
  : null;

describe('Phase 4 Order Lifecycle & Auto-Assignment Tests', () => {
  let customer, admin, agentA, agentB, agentC, agentD;
  let customerToken, adminToken, agentAToken;
  let zoneDelhi, zoneBangalore;

  beforeAll(async () => {
    jest.spyOn(NotificationService, 'notifyStatusChange').mockResolvedValue({ success: true, mock: true });
    if (!TEST_DB_URI) {
      throw new Error('MONGODB_URI is not set in environment.');
    }
    await mongoose.connect(TEST_DB_URI);
    try {
      await mongoose.connection.dropDatabase();
    } catch (e) {
      console.warn('Drop database warning:', e.message);
    }
    await User.syncIndexes();
    await Zone.syncIndexes();
    await RateCard.syncIndexes();
    await Order.syncIndexes();
  }, 30000);

  afterAll(async () => {
    // await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear collections
    await User.deleteMany({});
    await Zone.deleteMany({});
    await RateCard.deleteMany({});
    await Order.deleteMany({});
    await TrackingHistory.deleteMany({});

    // 1. Seed Zones
    zoneDelhi = await Zone.create({
      name: 'Zone Delhi',
      pincodes: ['110001', '110002']
    });

    zoneBangalore = await Zone.create({
      name: 'Zone Bangalore',
      pincodes: ['560001', '560002']
    });

    // 2. Seed Rate Cards
    await RateCard.create({
      orderType: 'B2B',
      zoneType: 'intra-zone',
      baseWeight: 1.0,
      baseRate: 50.0,
      perKgRate: 15.0,
      codSurcharge: 10.0
    });

    await RateCard.create({
      orderType: 'B2B',
      zoneType: 'inter-zone',
      baseWeight: 1.0,
      baseRate: 100.0,
      perKgRate: 25.0,
      codSurcharge: 15.0
    });

    // 3. Seed Users
    customer = await User.create({
      name: 'Customer John',
      email: 'customer@test.com',
      password: 'password123',
      phone: '1111111111',
      role: 'customer'
    });
    customerToken = jwt.sign({ id: customer._id, role: customer.role }, process.env.JWT_SECRET);

    admin = await User.create({
      name: 'Admin Boss',
      email: 'admin@test.com',
      password: 'password123',
      phone: '2222222222',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET);

    // Agent A (closer coordinate: 28.6100, 77.2000)
    agentA = await User.create({
      name: 'Agent A Delhi Closer',
      email: 'agentA@test.com',
      password: 'password123',
      phone: '3333333333',
      role: 'agent',
      agentMetadata: {
        isAvailable: true,
        currentZone: zoneDelhi._id,
        coordinates: { latitude: 28.6110, longitude: 77.2010 },
        activeOrderCount: 0
      }
    });
    agentAToken = jwt.sign({ id: agentA._id, role: agentA.role }, process.env.JWT_SECRET);

    // Agent B (further coordinate: 28.7000, 77.3000)
    agentB = await User.create({
      name: 'Agent B Delhi Further',
      email: 'agentB@test.com',
      password: 'password123',
      phone: '4444444444',
      role: 'agent',
      agentMetadata: {
        isAvailable: true,
        currentZone: zoneDelhi._id,
        coordinates: { latitude: 28.7000, longitude: 77.3000 },
        activeOrderCount: 0
      }
    });

    // Agent C (Bangalore Zone Agent)
    agentC = await User.create({
      name: 'Agent C Bangalore',
      email: 'agentC@test.com',
      password: 'password123',
      phone: '5555555555',
      role: 'agent',
      agentMetadata: {
        isAvailable: true,
        currentZone: zoneBangalore._id,
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
        activeOrderCount: 0
      }
    });

    // Agent D (Unavailable Agent Delhi)
    agentD = await User.create({
      name: 'Agent D Delhi Unavailable',
      email: 'agentD@test.com',
      password: 'password123',
      phone: '6666666666',
      role: 'agent',
      agentMetadata: {
        isAvailable: false,
        currentZone: zoneDelhi._id,
        coordinates: { latitude: 28.6110, longitude: 77.2010 },
        activeOrderCount: 0
      }
    });
  }, 30000);

  describe('Order Creation & Preview Values Verification', () => {
    it('should successfully create an order, calculate rate card values, and trigger auto-assignment', async () => {
      const orderData = {
        pickupAddress: {
          streetAddress: '123 Delhi St',
          area: 'Connaught Place',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          latitude: 28.6100,
          longitude: 77.2000
        },
        dropAddress: {
          streetAddress: '456 Delhi Outer',
          area: 'Rohini',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110002'
        },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.8,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      
      const order = res.body.data;
      expect(order.orderNumber).toMatch(/^DEL-\d+$/);
      expect(order.pickupZone._id).toBe(zoneDelhi._id.toString());
      expect(order.dropZone._id).toBe(zoneDelhi._id.toString());
      expect(order.zoneType).toBe('intra-zone');
      expect(order.volumetricWeight).toBe(0.2);
      expect(order.billableWeight).toBe(0.8);
      expect(order.deliveryCharge).toBe(50.0); // baseRate = 50

      // Auto-assignment verification (Agent A is closer than Agent B)
      expect(order.deliveryAgent._id).toBe(agentA._id.toString());
      expect(order.status).toBe('Assigned');

      // Verify Agent A workload was incremented
      const updatedAgentA = await User.findById(agentA._id);
      expect(updatedAgentA.agentMetadata.activeOrderCount).toBe(1);

      // Verify initial tracking history creation
      const history = await TrackingHistory.find({ orderId: order._id }).sort({ timestamp: 1 });
      expect(history.length).toBe(2); // 'Pending' (placed) and 'Assigned' (auto-assigned)
      expect(history[0].newStatus).toBe('Pending');
      expect(history[1].newStatus).toBe('Assigned');
    });

    it('should result in Pending Assignment status if no available agent exists in zone', async () => {
      const orderData = {
        pickupAddress: {
          streetAddress: '123 Bangalore St',
          area: 'Bangalore City',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001'
        },
        dropAddress: {
          streetAddress: '456 Bangalore St',
          area: 'Bangalore East',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560002'
        },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      // Set Agent C (the only Bangalore agent) to unavailable
      await User.findByIdAndUpdate(agentC._id, { 'agentMetadata.isAvailable': false });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.status).toBe('Pending Assignment');
      expect(res.body.data.deliveryAgent).toBeNull();
    });
  }, 30000);

  describe('Deterministic Agent Assignment Hierarchy', () => {
    
    it('should select closest agent using Haversine distance when coordinates are present', async () => {
      // Order pickup: 28.6100, 77.2000
      // Agent A: 28.6110, 77.2010 (closer)
      // Agent B: 28.7000, 77.3000 (further)
      const orderData = {
        pickupAddress: {
          streetAddress: 'Pickup', area: 'Area', city: 'Delhi', state: 'Delhi',
          pincode: '110001', latitude: 28.6100, longitude: 77.2000
        },
        dropAddress: {
          streetAddress: 'Drop', area: 'Area', city: 'Delhi', state: 'Delhi',
          pincode: '110002'
        },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.deliveryAgent._id).toBe(agentA._id.toString());
    });

    it('should select agent with lowest activeOrderCount when coordinates are unavailable', async () => {
      // Order pickup has no coordinates
      const orderData = {
        pickupAddress: {
          streetAddress: 'Pickup', area: 'Area', city: 'Delhi', state: 'Delhi',
          pincode: '110001' // no lat/long coordinates
        },
        dropAddress: {
          streetAddress: 'Drop', area: 'Area', city: 'Delhi', state: 'Delhi',
          pincode: '110002'
        },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      // Set Agent A workload to 2, Agent B workload is 0
      await User.findByIdAndUpdate(agentA._id, { 'agentMetadata.activeOrderCount': 2 });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      expect(res.statusCode).toBe(201);
      // Coordinates missing, Agent B selected because 0 < 2 workload
      expect(res.body.data.deliveryAgent._id).toBe(agentB._id.toString());
    });

    it('should tie-break alphabetically by Agent ID when workloads are equal and coordinates missing', async () => {
      const orderData = {
        pickupAddress: {
          streetAddress: 'Pickup', area: 'Area', city: 'Delhi', state: 'Delhi', pincode: '110001'
        },
        dropAddress: {
          streetAddress: 'Drop', area: 'Area', city: 'Delhi', state: 'Delhi', pincode: '110002'
        },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      expect(res.statusCode).toBe(201);
      
      // Determine which ID is alphabetically smaller
      const expectedAgentId = agentA._id.toString().localeCompare(agentB._id.toString()) < 0 
        ? agentA._id.toString() 
        : agentB._id.toString();

      expect(res.body.data.deliveryAgent._id).toBe(expectedAgentId);
    });
  }, 30000);

  describe('Manual Admin Assignment', () => {
    it('should allow Admin to manually assign any eligible agent to Pending Assignment orders', async () => {
      // 1. Create order that defaults to Pending Assignment in Bangalore Zone (Agent C unavailable)
      await User.findByIdAndUpdate(agentC._id, { 'agentMetadata.isAvailable': false });
      
      const orderData = {
        pickupAddress: { streetAddress: '1', area: 'A', city: 'B', state: 'S', pincode: '560001' },
        dropAddress: { streetAddress: '2', area: 'A', city: 'B', state: 'S', pincode: '560002' },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      const creationRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      const orderId = creationRes.body.data._id;
      expect(creationRes.body.data.status).toBe('Pending Assignment');

      // 2. Set Agent C to available again
      await User.findByIdAndUpdate(agentC._id, { 'agentMetadata.isAvailable': true });

      // 3. Admin manually assigns Agent C
      const assignRes = await request(app)
        .post(`/api/orders/${orderId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: agentC._id });

      expect(assignRes.statusCode).toBe(200);
      expect(assignRes.body.data.status).toBe('Assigned');
      expect(assignRes.body.data.deliveryAgent._id).toBe(agentC._id.toString());

      // Verify Agent C workload incremented
      const updatedAgentC = await User.findById(agentC._id);
      expect(updatedAgentC.agentMetadata.activeOrderCount).toBe(1);

      // Verify timeline records the manual assignment actor
      const history = await TrackingHistory.find({ orderId }).sort({ timestamp: -1 });
      expect(history[0].newStatus).toBe('Assigned');
      expect(history[0].actor.userId.toString()).toBe(admin._id.toString());
      expect(history[0].actor.role).toBe('admin');
    });

    it('should reject manual assignment if target user is not an agent', async () => {
      // Create Pending Assignment order
      await User.findByIdAndUpdate(agentC._id, { 'agentMetadata.isAvailable': false });
      const orderData = {
        pickupAddress: { streetAddress: '1', area: 'A', city: 'B', state: 'S', pincode: '560001' },
        dropAddress: { streetAddress: '2', area: 'A', city: 'B', state: 'S', pincode: '560002' },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };
      const creationRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      // Admin attempts to assign the Customer as the agent
      const assignRes = await request(app)
        .post(`/api/orders/${creationRes.body.data._id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: customer._id });

      expect(assignRes.statusCode).toBe(400);
      expect(assignRes.body.success).toBe(false);
      expect(assignRes.body.message).toContain('not a delivery agent');
    });
  }, 30000);

  describe('Centralized Lifecycle Transitions & Attempts Validation', () => {
    let activeOrder;

    beforeEach(async () => {
      // Create a successfully auto-assigned order to Agent A
      const orderData = {
        pickupAddress: {
          streetAddress: '123 Delhi St', area: 'Connaught Place', city: 'Delhi', state: 'Delhi', pincode: '110001',
          latitude: 28.6100, longitude: 77.2000
        },
        dropAddress: { streetAddress: '456 Delhi Outer', area: 'Rohini', city: 'Delhi', state: 'Delhi', pincode: '110002' },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.8,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData);

      activeOrder = res.body.data;
    }, 30000);

    it('should validate complete status pipeline and physical attempt logging', async () => {
      const orderId = activeOrder._id;

      // 1. Assigned -> Picked Up
      let res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'Picked Up' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('Picked Up');
      expect(res.body.data.attempts.length).toBe(0); // No physical attempt yet

      // 2. Picked Up -> In Transit
      res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'In Transit' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('In Transit');

      // 3. In Transit -> Out for Delivery
      res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'Out for Delivery' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('Out for Delivery');

      // 4. Out for Delivery -> Failed
      res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'Failed', remarks: 'Recipient was out of town' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('Failed');

      // Verify Delivery Attempt is logged
      expect(res.body.data.attempts.length).toBe(1);
      expect(res.body.data.attempts[0].attemptNumber).toBe(1);
      expect(res.body.data.attempts[0].status).toBe('Failed');
      expect(res.body.data.attempts[0].failureRemarks).toBe('Recipient was out of town');

      // Verify Agent A workload is decremented back to 0
      const updatedAgentA = await User.findById(agentA._id);
      expect(updatedAgentA.agentMetadata.activeOrderCount).toBe(0);

      // 5. Failed -> Rescheduled
      // Actor is Admin
      res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`) // in Phase 5 customer reschedules via custom endpoint, but status transitions to Rescheduled
        .send({ status: 'Rescheduled' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('Rescheduled');
      expect(res.body.data.deliveryAgent).toBeNull(); // Agent released

      // 6. Rescheduled -> Pending Assignment
      res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Pending Assignment' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('Pending Assignment');
    });

    it('should reject invalid transition jumps', async () => {
      const orderId = activeOrder._id;
      // Assigned -> In Transit is invalid (must go through Picked Up)
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'In Transit' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid status transition');
    });

    it('should prevent agent workloads from dropping below 0', async () => {
      // Force Agent A workload to 0 manually
      await User.findByIdAndUpdate(agentA._id, { 'agentMetadata.activeOrderCount': 0 });

      const orderId = activeOrder._id;

      // Complete lifecycle to Out for Delivery
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentAToken}`).send({ status: 'Picked Up' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentAToken}`).send({ status: 'In Transit' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentAToken}`).send({ status: 'Out for Delivery' });
      
      // Out for Delivery -> Delivered (ends assignment)
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'Delivered' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('Delivered');

      // Workload should remain clamped at 0
      const updatedAgentA = await User.findById(agentA._id);
      expect(updatedAgentA.agentMetadata.activeOrderCount).toBe(0);
    });

    it('should correctly update workloads during manual agent reassignment', async () => {
      const orderId = activeOrder._id; // Currently Assigned to Agent A (Delhi Closer)
      
      let updatedAgentA = await User.findById(agentA._id);
      expect(updatedAgentA.agentMetadata.activeOrderCount).toBe(1);
      
      let updatedAgentB = await User.findById(agentB._id);
      expect(updatedAgentB.agentMetadata.activeOrderCount).toBe(0);

      // Admin manually reassigns the order to Agent B
      const assignRes = await request(app)
        .post(`/api/orders/${orderId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: agentB._id });

      expect(assignRes.statusCode).toBe(200);
      expect(assignRes.body.data.status).toBe('Assigned');
      expect(assignRes.body.data.deliveryAgent._id).toBe(agentB._id.toString());

      // Agent A workload should decrease from 1 to 0
      updatedAgentA = await User.findById(agentA._id);
      expect(updatedAgentA.agentMetadata.activeOrderCount).toBe(0);

      // Agent B workload should increase from 0 to 1
      updatedAgentB = await User.findById(agentB._id);
      expect(updatedAgentB.agentMetadata.activeOrderCount).toBe(1);
    });
  }, 30000);
});
