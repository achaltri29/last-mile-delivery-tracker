const path = require('path');
// Load environment variables from the root .env file
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

// Start server after connecting to database
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running in production-ready mode on port ${PORT}`);
    });
  } catch (error) {
    console.error(`Fatal error starting server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
