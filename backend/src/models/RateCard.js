const mongoose = require('mongoose');

const rateCardSchema = new mongoose.Schema({
  orderType: {
    type: String,
    enum: ['B2B', 'B2C'],
    required: [true, 'Order type is required']
  },
  zoneType: {
    type: String,
    enum: ['intra-zone', 'inter-zone'],
    required: [true, 'Zone type is required']
  },
  baseWeight: {
    type: Number,
    required: [true, 'Base weight is required'],
    min: [0, 'Base weight cannot be negative']
  },
  baseRate: {
    type: Number,
    required: [true, 'Base rate is required'],
    min: [0, 'Base rate cannot be negative']
  },
  perKgRate: {
    type: Number,
    required: [true, 'Incremental per-kg rate is required'],
    min: [0, 'Incremental per-kg rate cannot be negative']
  },
  codSurcharge: {
    type: Number,
    required: [true, 'COD surcharge is required'],
    min: [0, 'COD surcharge cannot be negative']
  }
}, {
  timestamps: true
});

// Ensure compound uniqueness so only one rate configuration exists per category type
rateCardSchema.index({ orderType: 1, zoneType: 1 }, { unique: true });

module.exports = mongoose.model('RateCard', rateCardSchema);
