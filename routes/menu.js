// routes/menu.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const adminAuth = require("../middleware/adminAuth"); // adjust if your path differs
const MenuItem = require("../models/MenuItem");

const router = express.Router();

// ensure /public/uploads exists
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "image", ext)
      .replace(/\s+/g, "-")
      .slice(0, 40);
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    // Basic extension check (optional: use MIME type check too)
    if (!/\.jpe?g$|\.png$|\.webp$|\.gif$/i.test(file.originalname || "")) {
      return cb(new Error("Images only"));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ---------- CRUD ----------

// List (filter by category, search q)
router.get("/", adminAuth, async (req, res) => {
  try {
    const { category, q } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (q) filter.name = { $regex: q, $options: "i" };

    const items = await MenuItem.find(filter).sort({ sort: 1, createdAt: -1 });
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get one
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item)
      return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const body = JSON.parse(req.body.data || "{}");
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";

    if (
      (!body.sizes || body.sizes.length === 0) &&
      (!body.price || body.price < 0)
    ) {
      return res.status(400).json({
        success: false,
        error: "Provide base price or at least one size.",
      });
    }

    const item = await MenuItem.create({ ...body, imageUrl });
    res.status(201).json({ success: true, item });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, error: e.message });
  }
});

// Update
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const body = JSON.parse(req.body.data || "{}");
    const update = { ...body };
    if (req.file) update.imageUrl = `/uploads/${req.file.filename}`;

    const item = await MenuItem.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!item)
      return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Delete
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item)
      return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Reorder: [{_id, sort}]
router.post("/reorder", adminAuth, async (req, res) => {
  try {
    const { items = [] } = req.body || {};
    await Promise.all(
      items.map((it) =>
        MenuItem.updateOne(
          { _id: it._id },
          { $set: { sort: Number(it.sort) || 0 } }
        )
      )
    );
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
