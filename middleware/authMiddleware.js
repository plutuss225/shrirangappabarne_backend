const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader) {
    if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
      token = authHeader.split(" ")[1];
    } else {
      token = authHeader;
    }
  }

  // 2. Check cookies via cookie-parser
  if (!token && req.cookies) {
    token = req.cookies.auth_token || req.cookies.token || req.cookies["auth-token"];
  }

  // 3. Fallback raw cookie header parsing
  if (!token && req.headers.cookie) {
    const rawCookies = req.headers.cookie.split(";");
    for (const cookie of rawCookies) {
      const parts = cookie.trim().split("=");
      const key = parts[0];
      const val = parts.slice(1).join("=");
      if (key === "auth_token" || key === "token" || key === "auth-token") {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  if (!token) {
    return res.status(401).json({ message: "No token provided, authorization denied" });
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
