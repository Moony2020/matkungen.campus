// models/Setting.js
const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true }, // e.g. "store"
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", SettingSchema);
