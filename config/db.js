// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Optional: keep Mongoose happy on older connection strings
    mongoose.set("strictQuery", true);

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Helps avoid DNS stalls in some hosts
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
    });

    console.log(
      `✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`
    );
  } catch (err) {
    console.error("❌ MongoDB connection error:", err?.message);
    // Let the process crash in containers so the platform restarts it
    process.exit(1);
  }
};

module.exports = connectDB;
