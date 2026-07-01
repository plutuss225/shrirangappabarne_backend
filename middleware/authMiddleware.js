const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided, authorization denied" });
  }

  // Support Bearer token format
  let token = authHeader;
  if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
    token = authHeader.split(" ")[1];
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret");
    
    // Add user from payload to request object
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token is not valid, authorization denied" });
  }
};

module.exports = authMiddleware;
