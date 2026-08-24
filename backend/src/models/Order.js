const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  streetAddress: { type: String, required: true, trim: true },
  area: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  pincode: { type: String, required: true, trim: true },
  latitude: { type: Number },
  longitude: { type: Number }
}, { _id: false });

const dimensionsSchema = new mongoose.Schema({
  length: { type: Number, required: true, min: 0.1 },  // in cm
  breadth: { type: Number, required: true, min: 0.1 }, // in cm
  height: { type: Number, required: true, min: 0.1 }   // in cm
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  attemptNumber: {
    type: Number,
    required: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dateTime: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Delivered', 'Failed'],
    required: true
  },
  failureRemarks: {
    type: String,
    trim: true
  },
  rescheduledDate: {
    type: Date
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deliveryAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  pickupAddress: {
    type: addressSchema,
    required: true
  },
  dropAddress: {
    type: addressSchema,
    required: true
  },
  pickupZone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    required: true
  },
  dropZone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    required: true
  },
  zoneType: {
    type: String,
    enum: ['intra-zone', 'inter-zone'],
    required: true
  },
  dimensions: {
    type: dimensionsSchema,
    required: true
  },
  actualWeight: {
    type: Number,
    required: true,
    min: 0.01 // in kg
  },
  volumetricWeight: {
    type: Number,
    required: true,
    min: 0
  },
  billableWeight: {
    type: Number,
    required: true,
    min: 0.01
  },
  orderType: {
    type: String,
    enum: ['B2B', 'B2C'],
    required: true
  },
  paymentType: {
    type: String,
    enum: ['Prepaid', 'COD'],
    required: true
  },
  deliveryCharge: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: [
      'Pending',
      'Pending Assignment',
      'Assigned',
      'Picked Up',
      'In Transit',
      'Out for Delivery',
      'Delivered',
      'Failed',
      'Rescheduled'
    ],
    default: 'Pending'
  },
  attempts: {
    type: [attemptSchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
