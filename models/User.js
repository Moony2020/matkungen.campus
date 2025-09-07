// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto"); // import crypto

// 1) Define schema first
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },

  // Email required + unique (guest checkout still supplies email)
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },

  password: { type: String, required: true }, // random for guests
  phone: { type: String, default: "", trim: true },
  address: { type: String, default: "" },

  isAdmin: { type: Boolean, default: false },
  isGuest: { type: Boolean, default: false }, // mark guest accounts

  resetPasswordToken: String,
  resetPasswordExpire: Date,

  createdAt: { type: Date, default: Date.now },
});

// 2) Indexes (AFTER schema is created)
userSchema.index({ createdAt: -1 });
userSchema.index({ name: "text", email: "text", phone: "text" });

// 3) Hooks/ Generate JWT token/ Hash password before saving;
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// 4) Methods/ Generate password reset token
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .toString("hex");
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

// 5) Export
module.exports = mongoose.model("User", userSchema);
