// routes/menu.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const adminAuth = require("../middleware/adminAuth"); // adjust if your path differs
const MenuItem = require("../models/MenuItem");

const router = express.Router();

/* ----------------------- helpers (local, no imports) ---------------------- */
function slugify(s = "") {
  return String(s)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(raw = "") {
  const c = String(raw || "")
    .trim()
    .toLowerCase();
  if (["roller", "rollers", "rolls"].includes(c)) return "rollers";
  if (["pita-bread", "pitabrod", "pitabröd", "pita"].includes(c))
    return "pitabrod";
  if (
    [
      "addition",
      "additions",
      "addition-menu",
      "tillbehör",
      "tillbehor",
    ].includes(c)
  )
    return "addition";
  if (["veg", "vegetarian", "vegetarisk"].includes(c)) return "vegetarisk";
  if (["drinks", "drink", "drinker", "drycker"].includes(c)) return "drinks";
  return c; // pizza, burgers, salads, dishes, boxes, lunch, etc.
}

function mapModifiers(dbGroups) {
  const arr = Array.isArray(dbGroups) ? dbGroups : [];
  const mapped = arr.map((g) => {
    const isRadio = !!g?.required && (g?.max === 1 || g?.min === 1);
    return {
      title: g?.name || "",
      type: isRadio ? "radio" : "checkbox",
      required: !!g?.required,
      min: Number(g?.min) || 0,
      max: Number(g?.max) || 0,
      options: (Array.isArray(g?.options) ? g.options : []).map((o) => ({
        label: o?.name || "",
        value: slugify(o?.name || ""),
        price: Number(o?.price) || 0,
      })),
    };
  });

  // Always append a “special instructions” textarea (as your customer UI expects)
  mapped.push({
    title: "Speciella instruktioner",
    type: "textarea",
    placeholder: "T.ex. ingen lök, extra sås …",
  });

  return mapped;
}

// shape the public item exactly like /api/menu
function toPublicItem(d) {
  return {
    id: d._id.toString(),
    name: d.name,
    desc: d.description || "",
    price:
      d.price ?? (Array.isArray(d.sizes) && d.sizes[0] ? d.sizes[0].price : 0),
    image: d.imageUrl || "/assets/images/default-food.jpg",
    category: normalizeCategory(d.category),
    sizes: Array.isArray(d.sizes) ? d.sizes : [],
    modifiers: mapModifiers(d.modifiers),
  };
}

/* ----------------------- uploads: ensure dir exists ----------------------- */
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
    if (!/\.jpe?g$|\.png$|\.webp$|\.gif$/i.test(file.originalname || "")) {
      return cb(new Error("Images only"));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* --------------------------------- CRUD ---------------------------------- */

// List (admin)
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

// Get one (admin)
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

// Create (admin)
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

    // 🔔 notify customer UI with the **public mapped shape** (modifiers included)
    const io = req.app.get("io");
    io?.emit("menu:new", toPublicItem(item));

    res.status(201).json({ success: true, item });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, error: e.message });
  }
});

// Update (admin)
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

    // 🔔 notify customer UI with the **public mapped shape** (modifiers included)
    req.app.get("io")?.emit("menu:update", toPublicItem(item));

    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item)
      return res.status(404).json({ success: false, error: "Not found" });

    // notify clients
    req.app.get("io")?.emit("menu:delete", {
      _id: String(item._id),
      category: item.category,
    });

    // respond with JSON (not 204) so frontend .json() won't break
    return res.json({ success: true, deletedId: String(item._id) });
  } catch (e) {
    if (e?.name === "CastError") {
      return res.status(400).json({ success: false, error: "Invalid ID" });
    }
    console.error("Delete error:", e);
    return res.status(500).json({ success: false, error: "Server error" });
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
