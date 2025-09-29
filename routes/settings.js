// routes/settings.js
const express = require("express");
const adminAuth = require("../middleware/adminAuth");
const Setting = require("../models/Setting");

const router = express.Router();

// Upsert a settings document by key
router.post("/:key", adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const doc = await Setting.findOneAndUpdate(
      { key },
      { value },
      { new: true, upsert: true }
    );

    // notify clients
    const io = req.app.get("io");
    if (io) io.emit("store-settings-updated", { key });

    res.json({ success: true, doc });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Read settings by key
router.get("/:key", adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const doc = await Setting.findOne({ key });
    res.json({ success: true, value: doc?.value ?? {} });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
