const path = require('path');
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

describe('Phase 6 Admin CRUD Integration Tests', () => {
  let admin, customer, agent;
  let adminToken, customerToken;
  let zoneDelhi, zoneMumbai;
  let rateB2BIntra;

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
    // Keep connection alive or disconnect if it's the last suite. Jest handles it.
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Zone.deleteMany({});
    await RateCard.deleteMany({});
    await Order.deleteMany({});
    await TrackingHistory.deleteMany({});

    // Create Admin & Customer
    admin = await User.create({
      name: 'Admin Boss',
      email: 'admin@test.com',
      password: 'password123',
      phone: '9999999999',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET);

    customer = await User.create({
      name: 'Customer John',
      email: 'customer@test.com',
      password: 'password123',
      phone: '8888888888',
      role: 'customer'
    });
    customerToken = jwt.sign({ id: customer._id, role: customer.role }, process.env.JWT_SECRET);

    agent = await User.create({
      name: 'Agent A',
      email: 'agent@test.com',
      password: 'password123',
      phone: '7777777777',
      role: 'agent'
    });

    // Seed test configurations
    zoneDelhi = await Zone.create({
      name: 'Zone Delhi',
      pincodes: ['110001', '110002']
    });

    zoneMumbai = await Zone.create({
      name: 'Zone Mumbai',
      pincodes: ['400001', '400002']
    });

    rateB2BIntra = await RateCard.create({
      orderType: 'B2B',
      zoneType: 'intra-zone',
      baseWeight: 1.0,
      baseRate: 50.0,
      perKgRate: 15.0,
      codSurcharge: 10.0
    });
  });

  describe('Zone CRUD Operations', () => {
    test('Admin can create a new zone successfully', async () => {
      const res = await request(app)
        .post('/api/orders/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Bangalore',
          pincodes: ['560001', '560002'],
          description: 'South zone'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Zone Bangalore');
      expect(res.body.data.pincodes).toContain('560001');
    });

    test('Non-admin user cannot create a zone', async () => {
      const res = await request(app)
        .post('/api/orders/zones')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Zone Unauthorized',
          pincodes: ['999999']
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Cannot create zone with duplicate name', async () => {
      const res = await request(app)
        .post('/api/orders/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Delhi',
          pincodes: ['220001']
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    test('Cannot map a pincode that is already assigned to another zone', async () => {
      const res = await request(app)
        .post('/api/orders/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Duplicate Pins',
          pincodes: ['110001', '330001'] // 110001 is inside Zone Delhi
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already mapped to zone');
    });

    test('Admin can update zone details and add new pincodes', async () => {
      const res = await request(app)
        .put(`/api/orders/zones/${zoneDelhi._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Delhi Updated',
          pincodes: ['110001', '110002', '110003'],
          description: 'Updated Capital zone'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Zone Delhi Updated');
      expect(res.body.data.pincodes).toContain('110003');
    });

    test('Cannot update zone to use a name already taken by another zone', async () => {
      const res = await request(app)
        .put(`/api/orders/zones/${zoneDelhi._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Mumbai',
          pincodes: ['110001', '110002']
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already used');
    });

    test('Cannot update zone with a pincode already assigned to another zone', async () => {
      const res = await request(app)
        .put(`/api/orders/zones/${zoneDelhi._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Delhi',
          pincodes: ['110001', '400001'] // 400001 is mapped to Zone Mumbai
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already mapped to another zone');
    });

    test('Cannot remove pincodes from a zone if they have active orders', async () => {
      // Place an active order under pincode 110002 (Delhi)
      await Order.create({
        orderNumber: 'DEL-ACTIVE-TEST',
        customer: customer._id,
        deliveryAgent: agent._id,
        pickupAddress: { streetAddress: 'CP Office 12', area: 'Connaught Place', city: 'Delhi', pincode: '110001', state: 'Delhi' },
        dropAddress: { streetAddress: 'Sector 5 House 11', area: 'Rohini', city: 'Delhi', pincode: '110002', state: 'Delhi' },
        pickupZone: zoneDelhi._id,
        dropZone: zoneDelhi._id,
        zoneType: 'intra-zone',
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 1,
        volumetricWeight: 0.2,
        billableWeight: 1,
        orderType: 'B2B',
        paymentType: 'Prepaid',
        deliveryCharge: 50.0,
        status: 'Assigned'
      });

      // Attempt to update Delhi Zone by removing 110002
      const res = await request(app)
        .put(`/api/orders/zones/${zoneDelhi._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Delhi',
          pincodes: ['110001'] // Removed 110002, which is linked to DEL-ACTIVE-TEST
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Cannot remove pincodes');
    });

    test('Admin can delete a zone that has no active orders', async () => {
      const res = await request(app)
        .delete(`/api/orders/zones/${zoneMumbai._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const searchZone = await Zone.findById(zoneMumbai._id);
      expect(searchZone).toBeNull();
    });

    test('Cannot delete a zone that contains active orders', async () => {
      // Place active order in Mumbai zone
      await Order.create({
        orderNumber: 'MUM-ACTIVE-TEST',
        customer: customer._id,
        pickupAddress: { streetAddress: 'Hill Road Shop 4', area: 'Bandra', city: 'Mumbai', pincode: '400001', state: 'Maharashtra' },
        dropAddress: { streetAddress: 'Link Road Plaza 2', area: 'Andheri', city: 'Mumbai', pincode: '400002', state: 'Maharashtra' },
        pickupZone: zoneMumbai._id,
        dropZone: zoneMumbai._id,
        zoneType: 'intra-zone',
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 1,
        volumetricWeight: 0.2,
        billableWeight: 1,
        orderType: 'B2B',
        paymentType: 'Prepaid',
        deliveryCharge: 50.0,
        status: 'Pending Assignment'
      });

      const res = await request(app)
        .delete(`/api/orders/zones/${zoneMumbai._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Cannot delete zone');
    });
  });

  describe('Rate Card CRUD Operations', () => {
    test('Admin can update pricing rates successfully', async () => {
      const res = await request(app)
        .put(`/api/orders/rates/${rateB2BIntra._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          baseWeight: 2.0,
          baseRate: 75.0,
          perKgRate: 20.0,
          codSurcharge: 12.0
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.baseRate).toBe(75.0);
      expect(res.body.data.baseWeight).toBe(2.0);
    });

    test('Cannot update rate cards with negative values', async () => {
      const res = await request(app)
        .put(`/api/orders/rates/${rateB2BIntra._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          baseWeight: 2.0,
          baseRate: -10.0, // Negative base rate
          perKgRate: 20.0,
          codSurcharge: 12.0
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('non-negative numbers');
    });
  });
});
