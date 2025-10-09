// models/Availability.js
const mongoose = require("mongoose");

const AvailabilitySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true }, // menu item id (DB or static)
    available: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Availability", AvailabilitySchema);
