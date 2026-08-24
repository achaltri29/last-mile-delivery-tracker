const Zone = require('../models/Zone');
const RateCard = require('../models/RateCard');

class RateEngine {
  /**
   * Resolve pickup and drop pincodes to their corresponding zones and determine relation.
   * @param {string} pickupPincode 
   * @param {string} dropPincode 
   * @returns {Promise<{pickupZone: Object, dropZone: Object, zoneType: 'intra-zone'|'inter-zone'}>}
   */
  static async resolveZones(pickupPincode, dropPincode) {
    if (!pickupPincode || !dropPincode) {
      const err = new Error('Both pickup and drop pincodes are required.');
      err.statusCode = 400;
      throw err;
    }

    // Query zones containing the respective pincodes
    const pickupZone = await Zone.findOne({ pincodes: pickupPincode });
    const dropZone = await Zone.findOne({ pincodes: dropPincode });

    if (!pickupZone || !dropZone) {
      const missing = [];
      if (!pickupZone) missing.push(`pickup (${pickupPincode})`);
      if (!dropZone) missing.push(`drop (${dropPincode})`);
      
      const err = new Error(`Service unavailable: pincode not covered by any zone: ${missing.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const zoneType = pickupZone._id.toString() === dropZone._id.toString() 
      ? 'intra-zone' 
      : 'inter-zone';

    return { pickupZone, dropZone, zoneType };
  }

  /**
   * Calculate volumetric weight: (L * B * H) / 5000
   * @param {{length: number, breadth: number, height: number}} dimensions 
   * @returns {number}
   */
  static calculateVolumetricWeight(dimensions) {
    const { length, breadth, height } = dimensions;
    if (!length || !breadth || !height || length <= 0 || breadth <= 0 || height <= 0) {
      throw new Error('Valid package dimensions (length, breadth, height) are required.');
    }
    return (length * breadth * height) / 5000;
  }

  /**
   * Calculate final delivery charge based on physical params, zones, and rate card.
   * @param {object} params
   * @returns {Promise<object>}
   */
  static async calculateCharge({
    pickupPincode,
    dropPincode,
    dimensions,
    actualWeight,
    orderType,
    paymentType
  }) {
    // 1. Validate inputs
    if (!dimensions || typeof actualWeight !== 'number' || actualWeight <= 0) {
      const err = new Error('Valid package dimensions and actual weight are required.');
      err.statusCode = 400;
      throw err;
    }

    if (!['B2B', 'B2C'].includes(orderType)) {
      const err = new Error('Order type must be B2B or B2C.');
      err.statusCode = 400;
      throw err;
    }

    if (!['Prepaid', 'COD'].includes(paymentType)) {
      const err = new Error('Payment type must be Prepaid or COD.');
      err.statusCode = 400;
      throw err;
    }

    // 2. Resolve Zones
    const { pickupZone, dropZone, zoneType } = await this.resolveZones(pickupPincode, dropPincode);

    // 3. Volumetric & Billable Weight
    const volumetricWeight = this.calculateVolumetricWeight(dimensions);
    const billableWeight = Math.max(actualWeight, volumetricWeight);

    // 4. Rate Card Lookup
    const rateCard = await RateCard.findOne({ orderType, zoneType });
    if (!rateCard) {
      const err = new Error(`Rate card configuration not found for orderType: ${orderType} and zoneType: ${zoneType}.`);
      err.statusCode = 400;
      throw err;
    }

    // 5. Calculate base and extra weight charges
    const extraWeight = Math.max(0, billableWeight - rateCard.baseWeight);
    const baseAndExtraCharge = rateCard.baseRate + (extraWeight * rateCard.perKgRate);

    // 6. COD Surcharge
    const surcharge = paymentType === 'COD' ? rateCard.codSurcharge : 0;
    
    // 7. Final delivery charge
    const deliveryCharge = baseAndExtraCharge + surcharge;

    return {
      pickupZone: {
        id: pickupZone._id,
        name: pickupZone.name
      },
      dropZone: {
        id: dropZone._id,
        name: dropZone.name
      },
      zoneType,
      volumetricWeight: parseFloat(volumetricWeight.toFixed(3)),
      billableWeight: parseFloat(billableWeight.toFixed(3)),
      deliveryCharge: parseFloat(deliveryCharge.toFixed(2)),
      pricingBreakdown: {
        baseRate: rateCard.baseRate,
        baseWeight: rateCard.baseWeight,
        perKgRate: rateCard.perKgRate,
        codSurcharge: surcharge,
        extraWeight: parseFloat(extraWeight.toFixed(3)),
        extraWeightCharge: parseFloat((extraWeight * rateCard.perKgRate).toFixed(2))
      }
    };
  }
}

module.exports = RateEngine;
