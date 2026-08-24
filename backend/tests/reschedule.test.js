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
const EmailProvider = require('../src/services/providers/EmailProvider');
const SMSProvider = require('../src/services/providers/SMSProvider');
const NotificationService = require('../src/services/NotificationService');

const TEST_DB_URI = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace(/\/unthinkable_delivery([?]?)/, '/unthinkable_delivery_test$1')
  : null;

describe('Phase 5 Rescheduling & Notifications Tests', () => {
  let customerA, customerB, admin, agent;
  let customerAToken, customerBToken, agentToken;
  let zone;

  beforeAll(async () => {
    jest.spyOn(NotificationService, 'notifyStatusChange').mockResolvedValue({ success: true, mock: true });
    const nodemailer = require('nodemailer');
    jest.spyOn(nodemailer, 'createTestAccount').mockRejectedValue(new Error('Mock offline'));
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
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Zone.deleteMany({});
    await RateCard.deleteMany({});
    await Order.deleteMany({});
    await TrackingHistory.deleteMany({});

    // Seed Zone
    zone = await Zone.create({
      name: 'Delhi Zone',
      pincodes: ['110001', '110002']
    });

    // Seed RateCard
    await RateCard.create({
      orderType: 'B2B',
      zoneType: 'intra-zone',
      baseWeight: 1.0,
      baseRate: 50.0,
      perKgRate: 10.0,
      codSurcharge: 10.0
    });

    // Seed Users
    customerA = await User.create({
      name: 'Customer A',
      email: 'custA@test.com',
      password: 'password123',
      phone: '1111111111',
      role: 'customer'
    });
    customerAToken = jwt.sign({ id: customerA._id, role: customerA.role }, process.env.JWT_SECRET);

    customerB = await User.create({
      name: 'Customer B',
      email: 'custB@test.com',
      password: 'password123',
      phone: '2222222222',
      role: 'customer'
    });
    customerBToken = jwt.sign({ id: customerB._id, role: customerB.role }, process.env.JWT_SECRET);

    admin = await User.create({
      name: 'Admin Boss',
      email: 'admin@test.com',
      password: 'password123',
      phone: '3333333333',
      role: 'admin'
    });

    agent = await User.create({
      name: 'Agent A',
      email: 'agentA@test.com',
      password: 'password123',
      phone: '4444444444',
      role: 'agent',
      agentMetadata: {
        isAvailable: true,
        currentZone: zone._id,
        activeOrderCount: 0
      }
    });
    agentToken = jwt.sign({ id: agent._id, role: agent.role }, process.env.JWT_SECRET);
  }, 30000);

  describe('Rescheduling Flow & Attempts Integrity', () => {
    let orderId;

    beforeEach(async () => {
      // 1. Create order (auto-assigned to agent, status Assigned, workload = 1)
      const orderData = {
        pickupAddress: { streetAddress: 'CP', area: 'Delhi', city: 'Delhi', state: 'Delhi', pincode: '110001' },
        dropAddress: { streetAddress: 'Rohini', area: 'Delhi', city: 'Delhi', state: 'Delhi', pincode: '110002' },
        dimensions: { length: 10, breadth: 10, height: 10 },
        actualWeight: 0.5,
        orderType: 'B2B',
        paymentType: 'Prepaid'
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send(orderData);

      orderId = res.body.data._id;
    }, 30000);

    it('should successfully reschedule a failed delivery, release workload, and trigger re-assignment', async () => {
      // Verify Agent workload starts at 1
      let updatedAgent = await User.findById(agent._id);
      expect(updatedAgent.agentMetadata.activeOrderCount).toBe(1);

      // 2. Transition pipeline: Assigned -> Picked Up -> In Transit -> Out for Delivery -> Failed
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Picked Up' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'In Transit' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Out for Delivery' });
      
      // Mark as Failed (creates Attempt 1, decrements workload once to 0)
      const failRes = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ status: 'Failed', remarks: 'Address locked' });

      expect(failRes.statusCode).toBe(200);
      expect(failRes.body.data.status).toBe('Failed');
      expect(failRes.body.data.attempts.length).toBe(1);
      expect(failRes.body.data.attempts[0].attemptNumber).toBe(1);
      expect(failRes.body.data.attempts[0].status).toBe('Failed');
      expect(failRes.body.data.attempts[0].rescheduledDate).toBeUndefined();

      updatedAgent = await User.findById(agent._id);
      expect(updatedAgent.agentMetadata.activeOrderCount).toBe(0); // Workload released

      // 3. Customer reschedules (POST /api/orders/:id/reschedule)
      const rescheduledDate = new Date(Date.now() + 86400000 * 2); // 2 days in future
      const res = await request(app)
        .post(`/api/orders/${orderId}/reschedule`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ rescheduledDate });

      expect(res.statusCode).toBe(200);
      // Status goes Failed -> Rescheduled -> Pending Assignment -> Assigned (since Agent is available)
      expect(res.body.data.status).toBe('Assigned');
      expect(res.body.data.deliveryAgent._id).toBe(agent._id.toString());
      
      // Verify rescheduledDate is written to Attempt 1
      expect(res.body.data.attempts.length).toBe(1); // Do NOT create Attempt 2 yet
      expect(new Date(res.body.data.attempts[0].rescheduledDate).getTime()).toBe(rescheduledDate.getTime());

      // Verify Agent workload is incremented back to 1 (for the new rescheduled assignment)
      updatedAgent = await User.findById(agent._id);
      expect(updatedAgent.agentMetadata.activeOrderCount).toBe(1);

      // Verify no workload became negative
      expect(updatedAgent.agentMetadata.activeOrderCount).toBeGreaterThanOrEqual(0);

      // 4. Run second attempt to terminal Delivered status
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Picked Up' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'In Transit' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Out for Delivery' });
      
      const deliverRes = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ status: 'Delivered' });

      expect(deliverRes.statusCode).toBe(200);
      expect(deliverRes.body.data.status).toBe('Delivered');
      
      // Verify Attempt 2 is logged representing the next physical attempt
      expect(deliverRes.body.data.attempts.length).toBe(2);
      expect(deliverRes.body.data.attempts[1].attemptNumber).toBe(2);
      expect(deliverRes.body.data.attempts[1].status).toBe('Delivered');

      // Verify agent workload is released to 0
      updatedAgent = await User.findById(agent._id);
      expect(updatedAgent.agentMetadata.activeOrderCount).toBe(0);
    });

    it('should reject rescheduling if actor is not the owner customer', async () => {
      // Make it fail first
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Picked Up' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'In Transit' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Out for Delivery' });
      await request(app).patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${agentToken}`).send({ status: 'Failed', remarks: 'Address locked' });

      // Customer B (not owner) tries to reschedule
      const res = await request(app)
        .post(`/api/orders/${orderId}/reschedule`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ rescheduledDate: new Date() });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject rescheduling if order status is not Failed', async () => {
      // Order is currently Assigned
      const res = await request(app)
        .post(`/api/orders/${orderId}/reschedule`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ rescheduledDate: new Date() });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Only failed orders can be rescheduled');
    });
  }, 30000);

  describe('Notifications Provider Decoupling & Fallback Mocking', () => {
    let originalEnv;

    beforeAll(() => {
      originalEnv = {
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        FAST2SMS_API_KEY: process.env.FAST2SMS_API_KEY
      };
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.FAST2SMS_API_KEY;
    });

    afterAll(() => {
      Object.assign(process.env, originalEnv);
    });

    it('should execute EmailProvider and SMSProvider in development mock fallback', async () => {
      // Assert providers execute cleanly without throwing errors when no secrets exist
      const emailRes = await EmailProvider.send('cust@test.com', 'Test Subject', 'Test body');
      expect(emailRes.success).toBe(true);
      expect(emailRes.mock).toBe(true);

      const smsRes = await SMSProvider.send('1234567890', 'Test body');
      expect(smsRes.success).toBe(true);
      expect(smsRes.mock).toBe(true);
    });
  });
});
