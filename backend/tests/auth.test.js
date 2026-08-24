const path = require('path');
// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
jest.setTimeout(30000);

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Zone = require('../src/models/Zone');
const RateCard = require('../src/models/RateCard');
const Order = require('../src/models/Order');

// Use an isolated test database
const TEST_DB_URI = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace(/\/unthinkable_delivery([?]?)/, '/unthinkable_delivery_test$1')
  : null;

describe('Phase 2 Integration & Schema Tests', () => {
  
  beforeAll(async () => {
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
  }, 30000);

  afterAll(async () => {
    // Close connection cleanly in sequential run
    // await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear user collection before each test
    await User.deleteMany({});
    await Zone.deleteMany({});
    await RateCard.deleteMany({});
    await Order.deleteMany({});
  }, 30000);

  describe('User Model and Auth Endpoints', () => {
    
    const sampleCustomer = {
      name: 'John Customer',
      email: 'john@customer.com',
      password: 'SecurePassword123',
      phone: '1234567890',
      role: 'customer'
    };

    it('should successfully register a customer and hash their password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(sampleCustomer);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(sampleCustomer.email.toLowerCase());
      expect(res.body.user.role).toBe('customer');

      // Verify user was saved in db and password was hashed
      const user = await User.findOne({ email: sampleCustomer.email });
      expect(user).toBeTruthy();
      expect(user.password).not.toBe(sampleCustomer.password);
      
      const isMatch = await user.comparePassword(sampleCustomer.password);
      expect(isMatch).toBe(true);
    });

    it('should reject registration if role is not customer', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...sampleCustomer,
          role: 'admin'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('restricted to customer accounts');
    });

    it('should reject registration with duplicate email', async () => {
      await request(app).post('/api/auth/register').send(sampleCustomer);
      const res = await request(app).post('/api/auth/register').send(sampleCustomer);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already registered');
    });

    it('should successfully login and return a token', async () => {
      // Register customer first
      await request(app).post('/api/auth/register').send(sampleCustomer);

      // Attempt login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: sampleCustomer.email,
          password: sampleCustomer.password
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(sampleCustomer.email);
    });

    it('should reject login with wrong password', async () => {
      await request(app).post('/api/auth/register').send(sampleCustomer);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: sampleCustomer.email,
          password: 'WrongPassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Validation of Models', () => {

    it('should validate User Agent metadata when role is agent', async () => {
      const agent = new User({
        name: 'Agent Smith',
        email: 'smith@agent.com',
        password: 'password123',
        phone: '0987654321',
        role: 'agent',
        agentMetadata: {
          isAvailable: true,
          activeOrderCount: 2
        }
      });

      const savedAgent = await agent.save();
      expect(savedAgent.agentMetadata.isAvailable).toBe(true);
      expect(savedAgent.agentMetadata.activeOrderCount).toBe(2);
    });

    it('should validate Zone schema requirements', async () => {
      const zone = new Zone({
        name: 'North Zone',
        pincodes: ['110001', '110002'],
        description: 'Test Area coverage'
      });

      const savedZone = await zone.save();
      expect(savedZone._id).toBeDefined();
      expect(savedZone.pincodes).toContain('110001');

      // Test validation fails for empty pincodes array
      const invalidZone = new Zone({ name: 'West Zone', pincodes: [] });
      await expect(invalidZone.save()).rejects.toThrow();
    });

    it('should validate RateCard schema constraints', async () => {
      const card = new RateCard({
        orderType: 'B2B',
        zoneType: 'intra-zone',
        baseWeight: 1.0,
        baseRate: 40,
        perKgRate: 10,
        codSurcharge: 15
      });

      const savedCard = await card.save();
      expect(savedCard._id).toBeDefined();

      // Duplicate rate card (same orderType and zoneType) should fail compound index
      const duplicateCard = new RateCard({
        orderType: 'B2B',
        zoneType: 'intra-zone',
        baseWeight: 2.0,
        baseRate: 50,
        perKgRate: 12,
        codSurcharge: 20
      });

      await expect(duplicateCard.save()).rejects.toThrow();
    });
  });
});
