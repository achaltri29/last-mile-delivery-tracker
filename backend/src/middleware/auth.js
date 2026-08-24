const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate user via JWT
const authenticate = async (req, res, next) => {
  let token;

  // Retrieve token from Authorization header (Bearer <token>)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user from db, excluding password field
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found, authorization denied' });
      }

      // Attach user object to request
      req.user = user;
      next();
    } catch (error) {
      console.error('JWT auth validation error:', error.message);
      return res.status(401).json({ success: false, message: 'Not authorized, invalid token signature' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, access token missing' });
  }
};

// Middleware to check if user has required roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized, auth context missing' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' is not authorized to access this resource`
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorizeRoles
};
