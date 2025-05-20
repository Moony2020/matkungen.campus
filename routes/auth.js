const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const { generateToken, verifyToken } = require("../config/jwt");

const router = express.Router();

// === Setup Email Transporter ===
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ Register
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ error: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        address: user.address || ""
      }
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get current user info (protected)
router.get("/user", async (req, res) => {
  try {
    let token = req.header("Authorization");
    if (!token) return res.status(401).json({ error: "No token" });

    if (token.startsWith("Bearer ")) token = token.split(" ")[1];

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// ✅ Forgot Password - Send Reset Email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "No user with this email" });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save();

    // Create reset URL - make sure this matches your frontend route
    // const resetUrl = `${process.env.SERVER_URL}/reset-password/${resetToken}`;
    // const resetUrl = `${process.env
    //   .SERVER_URL}/reset-password.html?token=${resetToken}`;

    // Inside the forgot password route (auth.js)
    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/reset-password/${resetToken}`;

    const message = `
  <h2>Password Reset Request</h2>
  <p>You requested a password reset for your Matkungen account.</p>
  <p>Click the link below to reset your password:</p>
  <a href="${resetUrl}">Reset Password</a>  <!-- Clean link text -->
  <p>This link will expire in 10 minutes.</p>
`;

    await transporter.sendMail({
      to: user.email,
      subject: "Password Reset",
      html: message
    });

    res.json({ success: true, message: "Password reset link sent." });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    res.status(500).json({ error: "Email sending failed" });
  }
});

// ✅ Reset Password using Token
// ✅ Reset Password using Token
router.put("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    // Set new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(500).json({ error: "Could not reset password" });
  }
});

module.exports = router;
