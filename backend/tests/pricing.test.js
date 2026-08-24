const path = require('path');
// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
jest.setTimeout(30000);

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Zone = require('../src/models/Zone');
const RateCard = require('../src/models/RateCard');

const TEST_DB_URI = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace(/\/unthinkable_delivery([?]?)/, '/unthinkable_delivery_test$1')
  : null;

describe('Phase 3 Pricing Engine & Zone Detection Tests', () => {
  let zoneA, zoneB;

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
    await Zone.syncIndexes();
    await RateCard.syncIndexes();
  }, 30000);

  afterAll(async () => {
    // await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear collections
    await Zone.deleteMany({});
    await RateCard.deleteMany({});

    // Seed test zones
    zoneA = await Zone.create({
      name: 'Zone Delhi',
      pincodes: ['110001', '110002', '110003'],
      description: 'Delhi NCR region'
    });

    zoneB = await Zone.create({
      name: 'Zone Bangalore',
      pincodes: ['560001', '560002'],
      description: 'Bangalore region'
    });

    // Seed test rate cards
    // B2B - Intra-Zone Rate Card
    await RateCard.create({
      orderType: 'B2B',
      zoneType: 'intra-zone',
      baseWeight: 1.0,  // in kg
      baseRate: 50.0,
      perKgRate: 15.0,
      codSurcharge: 10.0
    });

    // B2B - Inter-Zone Rate Card
    await RateCard.create({
      orderType: 'B2B',
      zoneType: 'inter-zone',
      baseWeight: 1.0,
      baseRate: 100.0,
      perKgRate: 25.0,
      codSurcharge: 15.0
    });

    // B2C - Intra-Zone Rate Card
    await RateCard.create({
      orderType: 'B2C',
      zoneType: 'intra-zone',
      baseWeight: 2.0,
      baseRate: 60.0,
      perKgRate: 20.0,
      codSurcharge: 12.0
    });

    // B2C - Inter-Zone Rate Card
    await RateCard.create({
      orderType: 'B2C',
      zoneType: 'inter-zone',
      baseWeight: 2.0,
      baseRate: 120.0,
      perKgRate: 30.0,
      codSurcharge: 20.0
    });
  }, 30000);

  describe('Volumetric & Billable Weight calculations', () => {
    it('should compute volumetric weight correctly as (L*B*H)/5000', async () => {
      // 10 x 10 x 10 = 1000 / 5000 = 0.2 kg
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '110002' },
          dimensions: { length: 10, breadth: 10, height: 10 },
          actualWeight: 1.0, // actual weight is higher
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.volumetricWeight).toBe(0.2);
      expect(res.body.data.billableWeight).toBe(1.0); // actual weight is billable
    });

    it('should charge based on volumetric weight if it exceeds actual weight', async () => {
      // 50 x 40 x 30 = 60000 / 5000 = 12.0 kg
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '110002' },
          dimensions: { length: 50, breadth: 40, height: 30 },
          actualWeight: 5.0, // volumetric weight is higher
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.volumetricWeight).toBe(12.0);
      expect(res.body.data.billableWeight).toBe(12.0); // volumetric weight is billable
    });
  });

  describe('Zone Relation Rules', () => {
    it('should classify intra-zone when pickup and drop pincodes are in the same zone', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '110003' }, // Both in Zone Delhi
          dimensions: { length: 10, breadth: 10, height: 10 },
          actualWeight: 1.0,
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.zoneType).toBe('intra-zone');
      expect(res.body.data.pickupZone.name).toBe('Zone Delhi');
      expect(res.body.data.dropZone.name).toBe('Zone Delhi');
    });

    it('should classify inter-zone when pickup and drop pincodes are in different zones', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' }, // Zone Delhi
          dropAddress: { pincode: '560001' }, // Zone Bangalore
          dimensions: { length: 10, breadth: 10, height: 10 },
          actualWeight: 1.0,
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.zoneType).toBe('inter-zone');
      expect(res.body.data.pickupZone.name).toBe('Zone Delhi');
      expect(res.body.data.dropZone.name).toBe('Zone Bangalore');
    });

    it('should return 400 Bad Request if either pincode is not covered', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '999999' }, // Uncovered pincode
          dimensions: { length: 10, breadth: 10, height: 10 },
          actualWeight: 1.0,
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Service unavailable: pincode not covered by any zone');
    });

    it('should prevent overlapping pincodes across different zones', async () => {
      // Zone Delhi (seeded in beforeEach) already covers '110001'
      const overlappingZone = new Zone({
        name: 'Zone Overlapping',
        pincodes: ['110001', '900001'],
        description: 'Overlapping zone'
      });

      // Saving should fail due to unique index violation on pincodes
      await expect(overlappingZone.save()).rejects.toThrow();
    });
  });

  describe('Pricing Calculations & Formulas', () => {
    it('should calculate B2B intra-zone base price correctly without extra weight', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '110002' },
          dimensions: { length: 10, breadth: 10, height: 10 }, // 0.2kg
          actualWeight: 0.5, // billable weight is 0.5kg (less than base weight of 1kg)
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(200);
      // base rate for B2B intra-zone is 50.0. No extra weight.
      expect(res.body.data.deliveryCharge).toBe(50.0);
    });

    it('should calculate B2B inter-zone price correctly with extra weight charges', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '560001' },
          dimensions: { length: 10, breadth: 10, height: 10 }, // 0.2kg
          actualWeight: 3.5, // billable weight is 3.5kg. Extra weight = 3.5 - 1.0 = 2.5kg.
          orderType: 'B2B',
          paymentType: 'Prepaid'
        });

      expect(res.statusCode).toBe(200);
      // base rate = 100.0. perKgRate = 25.0. 
      // Charge = 100.0 + (2.5 * 25.0) = 100.0 + 62.5 = 162.5
      expect(res.body.data.deliveryCharge).toBe(162.5);
    });

    it('should add COD surcharge when payment type is COD', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '560001' },
          dimensions: { length: 10, breadth: 10, height: 10 },
          actualWeight: 3.5, // billable weight 3.5kg (extra weight 2.5kg)
          orderType: 'B2B',
          paymentType: 'COD'
        });

      expect(res.statusCode).toBe(200);
      // Charge without COD surcharge = 162.5.
      // B2B inter-zone COD surcharge = 15.0
      // Charge with COD surcharge = 162.5 + 15.0 = 177.5
      expect(res.body.data.deliveryCharge).toBe(177.5);
      expect(res.body.data.pricingBreakdown.codSurcharge).toBe(15.0);
    });

    it('should calculate B2C inter-zone price correctly with extra weight and COD surcharge', async () => {
      const res = await request(app)
        .post('/api/orders/calculate-rate')
        .send({
          pickupAddress: { pincode: '110001' },
          dropAddress: { pincode: '560001' },
          dimensions: { length: 10, breadth: 10, height: 10 },
          actualWeight: 4.5, // billable weight 4.5kg. Base weight 2.0kg. Extra weight = 2.5kg.
          orderType: 'B2C',
          paymentType: 'COD'
        });

      expect(res.statusCode).toBe(200);
      // B2C inter-zone: base rate = 120.0, perKgRate = 30.0, codSurcharge = 20.0.
      // Charge = 120.0 + (2.5 * 30.0) + 20.0 = 120.0 + 75.0 + 20.0 = 215.0
      expect(res.body.data.deliveryCharge).toBe(215.0);
    });
  });
});
