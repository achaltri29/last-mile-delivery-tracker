const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  role: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const trackingHistorySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  previousStatus: {
    type: String,
    default: null
  },
  newStatus: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  actor: {
    type: actorSchema,
    required: true
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: false // We explicitly use 'timestamp' field and require it to be immutable
});

// Create index for fast status checks on specific orders
trackingHistorySchema.index({ orderId: 1, timestamp: -1 });

module.exports = mongoose.model('TrackingHistory', trackingHistorySchema);
