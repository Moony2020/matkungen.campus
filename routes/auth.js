// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const { generateToken } = require("../config/jwt");

const router = express.Router();

/** ===================== Email Transport ===================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, //
  },
});

/** ======================== Register =========================
 *  NOTE: no manual hashing here; the User model's pre-save hook
 *  will hash the password exactly once.
 */
// routes/auth.js
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    // ⬇️ Don't hash here – the model's pre('save') will do it
    const user = new User({ name, email, password });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** ========================= Login ========================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Incorrect email or password." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(400).json({ error: "Incorrect email or password." });

    const expiresIn = remember ? "30d" : "1d";
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        address: user.address || "",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** ===================== Get current user ==================== */
router.get("/user", async (req, res) => {
  try {
    let token = req.header("Authorization");
    if (!token) return res.status(401).json({ error: "No token" });
    if (token.startsWith("Bearer ")) token = token.slice(7);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error("Get user error:", err);
    let msg = "Invalid token";
    if (err.name === "TokenExpiredError")
      msg = "Session expired. Please log in again.";
    if (err.name === "JsonWebTokenError") msg = "Invalid authentication token";
    res.status(401).json({ error: msg });
  }
});

/** ===================== Forgot password ===================== */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) {
      // You can return 200 here to avoid user enumeration; keeping your 404 is okay too.
      return res.status(404).json({ error: "No user with this email" });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false }); // save token/expiry only

    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/reset-password/${resetToken}`;
    const html = `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Matkungen account.</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link will expire in 10 minutes.</p>
    `;

    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    if (!from || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("✖ Missing EMAIL_* env vars");
      return res.status(500).json({ error: "Email is not configured" });
    }

    await transporter.sendMail({
      from,
      to: user.email,
      subject: "Password Reset",
      html,
    });

    return res.json({ success: true, message: "Password reset link sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    // Optional: reveal more detail in dev only
    const msg =
      process.env.NODE_ENV === "development"
        ? `Email sending failed: ${err?.message || err}`
        : "Email sending failed";
    return res.status(500).json({ error: msg });
  }
});

/** ===================== Reset password ======================
 *  Again: no manual hashing — assign new password and save;
 *  model hook will hash it.
 */
router.put("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password, remember } = req.body;

    if (!password || password.length < 6)
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user)
      return res.status(400).json({ error: "Invalid or expired token" });

    user.password = password; // pre-save hook will hash
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    const expiresIn = remember ? "30d" : "1d";
    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn,
    });

    res.json({
      success: true,
      message: "Password updated successfully",
      token: authToken,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Could not reset password" });
  }
});

/** ========================= Admin login ===================== */
router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, isAdmin: true });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, isAdmin: true },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, isAdmin: true },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
