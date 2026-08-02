const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // ✅ FIXED: Correct spelling: 'authorization'
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      error: 'no token provided'
    });
  }

  // Extract token from "Bearer TOKEN"
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: 'no token provided'
    });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach admin info to request object
    req.adminId = decoded.adminId;
    req.adminUsername = decoded.username;
    
    // Continue to the next middleware/route handler
    next();
  } catch (error) {
    console.error('JWT Error:', error.message);
    return res.status(403).json({
      error: 'Invalid or expired token'
    });
  }
};