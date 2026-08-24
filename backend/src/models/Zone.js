const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Zone name is required'],
    unique: true,
    trim: true
  },
  pincodes: {
    type: [String],
    required: [true, 'Supported pincodes list is required'],
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Zone must contain at least one supported pincode.'
    }
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index pincodes for fast query resolution and to enforce cross-document uniqueness
zoneSchema.index({ pincodes: 1 }, { unique: true });

module.exports = mongoose.model('Zone', zoneSchema);
