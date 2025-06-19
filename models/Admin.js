// models/Admin.js

const mongoose = require("mongoose");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const crypto = require("crypto");

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },

  email: { type: String, required: true, unique: true },

  password: { type: String, required: true },

  role: {
    type: String,

    enum: ["admin", "superadmin"],

    default: "admin",
  },

  resetPasswordToken: String,

  resetPasswordExpire: Date,

  createdAt: { type: Date, default: Date.now },
});

// Hash password before saving

// adminSchema.pre("save", async function(next) {

//   if (!this.isModified("password")) return next();

//   const salt = await bcrypt.genSalt(10);

//   this.password = await bcrypt.hash(this.password, salt);

//   next();

// });

// Generate JWT token

// In your login route

adminSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,

      role: this.role,
    },

    process.env.JWT_SECRET,

    { expiresIn: "1d" }
  );
};

// Generate password reset token

adminSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto

    .createHash("sha256")

    .update(resetToken)

    .digest("hex");

  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

module.exports = mongoose.model("Admin", adminSchema);
