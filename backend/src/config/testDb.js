const path = require('path');
// Load environment variables from the workspace root .env file
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');

async function testConnection() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is not defined in .env file.');
    process.exit(1);
  }

  // Mask credentials for safe logging
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`Attempting to connect to MongoDB Atlas...`);
  console.log(`Connection URI: ${maskedUri}`);

  try {
    // Connect to MongoDB using mongoose with a connection timeout
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });

    console.log('Successfully connected to MongoDB Atlas!');
    console.log(`Database name: ${mongoose.connection.name}`);

    if (mongoose.connection.name !== 'unthinkable_delivery') {
      console.warn(`Warning: Connected to database "${mongoose.connection.name}" instead of "unthinkable_delivery".`);
    }

    // Run a simple ping command to verify the connection is active
    console.log('Sending ping command to database...');
    const admin = mongoose.connection.db.admin();
    const result = await admin.ping();
    
    console.log('Ping response:', result);
    console.log('Database ping check successful!');
    process.exit(0);

  } catch (error) {
    console.error('Database connection test failed!');
    console.error('Error details:', error.message);
    process.exit(1);
  } finally {
    // Ensure the mongoose connection is closed cleanly
    await mongoose.disconnect();
    console.log('MongoDB connection closed cleanly.');
  }
}

testConnection();
