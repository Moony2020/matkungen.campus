// middleware/adminAuth.js
const jwt = require("jsonwebtoken");

const adminAuth = (req, res, next) => {
  let token = null;

  // 1) HttpOnly cookie (Option B)
  if (req.cookies && typeof req.cookies.admin_token === "string") {
    token = req.cookies.admin_token.trim();
  }

  // 2) Authorization: Bearer <token> (fallback)
  if (!token) {
    const auth = req.headers.authorization || "";
    if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
      token = auth.slice(7).trim();
    }
  }

  // 3) x-auth-token header (fallback)
  if (!token) {
    const x = req.header("x-auth-token");
    if (typeof x === "string" && x.trim()) token = x.trim();
  }

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Debug (remove later if you want)
    console.log("Decoded admin token:", {
      id: decoded?.id,
      role: decoded?.role,
      iat: decoded?.iat,
      exp: decoded?.exp,
    });

    if (!decoded.role || !["admin", "superadmin"].includes(decoded.role)) {
      return res
        .status(403)
        .json({ success: false, error: "Admin privileges required" });
    }

    req.admin = decoded;
    return next();
  } catch (err) {
    console.error("Admin auth error:", err?.message || err);
    return res
      .status(401)
      .json({ success: false, error: "Token is not valid" });
  }
};

module.exports = adminAuth;
