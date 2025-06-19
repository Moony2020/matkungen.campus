// scripts/create-admin.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Admin = require("../models/Admin");
require("dotenv").config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const email = "mymoon676@gmail.com";
    const password = "admin123";

    const existing = await Admin.findOne({ email });
    if (existing) {
      await Admin.deleteOne({ email });
      console.log("🧹 Deleted old admin.");
    }

    const hash = await bcrypt.hash(password, 10);
    await Admin.create({
      name: "Admin User",
      email,
      password: hash
    });

    console.log("✅ Admin created with password: admin123");
    process.exit();
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
    process.exit(1);
  }
}

createAdmin();
