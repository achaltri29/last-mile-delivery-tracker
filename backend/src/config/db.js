const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not defined in the environment.');
    process.exit(1);
  }

  // Mask credentials for safe logs
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`MongoDB Connected successfully to database: ${conn.connection.name}`);
    console.log(`Cluster Host: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
