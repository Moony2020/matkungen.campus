// routes/menu.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const adminAuth = require("../middleware/adminAuth"); // adjust if your path differs
const MenuItem = require("../models/MenuItem");
const Availability = require("../models/Availability");

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

function mapModifiers(dbGroups) {
  // 1) Take incoming groups (DB-like shape) or []
  const arr = Array.isArray(dbGroups) ? dbGroups : [];

  // 2) Drop any existing group that *is* or *looks like* "Speciella instruktioner"
  //    (these may be header-only, lack `type`, or have no options – we’ll add one cleanly below)
  const filtered = arr.filter((g) => {
    const title = String(g?.name || g?.title || "")
      .trim()
      .toLowerCase();
    return !/speciella?\s+instruktioner/.test(title);
  });

  // 3) Map remaining groups to the public/UI shape
  const mapped = filtered.map((g) => {
    const isRadio = !!g?.required && (g?.max === 1 || g?.min === 1);
    return {
      title: g?.name || g?.title || "",
      type: isRadio ? "radio" : "checkbox",
      required: !!g?.required,
      min: Number(g?.min) || 0,
      max: Number(g?.max) || 0,
      options: (Array.isArray(g?.options) ? g.options : []).map((o) => ({
        label: o?.name || o?.label || "",
        value: slugify(o?.name || o?.label || ""),
        price: Number(o?.price) || 0,
      })),
    };
  });

  // 4) Append exactly one textarea group
  mapped.push({
    title: "Speciella instruktioner",
    type: "textarea",
    placeholder: "T.ex. ingen lök, extra sås …",
  });

  return mapped;
}

function pickDisplayPrice(sizes = []) {
  const arr = Array.isArray(sizes) ? sizes : [];
  if (!arr.length) return 0;
  const mid = arr.find((s) => /medium/i.test(s.name || ""));
  if (mid) return Number(mid.price) || 0;
  if (arr[1]) return Number(arr[1].price) || 0; // common pattern: [Small, Medium, Large]
  return Number(arr[0].price) || 0;
}

// shape the public item exactly like /api/menu
function toPublicItem(d) {
  return {
    id: d._id.toString(),
    name: d.name,
    desc: d.description || "",
    price:
      Array.isArray(d.sizes) && d.sizes.length
        ? pickDisplayPrice(d.sizes)
        : Number(d.price || 0),
    image: d.imageUrl || "/assets/images/default-food.jpg",
    category: d.category, // ← pass-through (no normalize)
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
// load static JSON once (adjust path if your JSON lives elsewhere)
let STATIC_MENU = [];
(function loadStaticMenu() {
  try {
    const jsonPath = path.join(
      __dirname,
      "..",
      "public",
      "assets",
      "data",
      "menuItems.json"
    );
    STATIC_MENU = JSON.parse(fs.readFileSync(jsonPath, "utf8")) || [];
    console.log(`[admin menu] loaded ${STATIC_MENU.length} static items`);
  } catch (e) {
    console.warn(
      "[admin menu] could not load static menuItems.json:",
      e.message
    );
    STATIC_MENU = [];
  }
})();

// === helpers to persist STATIC_MENU back to JSON ===
function staticJsonPath() {
  return path.join(
    __dirname,
    "..",
    "public",
    "assets",
    "data",
    "menuItems.json"
  );
}
function saveStaticMenu() {
  try {
    fs.writeFileSync(
      staticJsonPath(),
      JSON.stringify(STATIC_MENU, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("[admin menu] failed to save menuItems.json:", e.message);
  }
}

function mergeSizes(oldItem, incoming) {
  const hadSizesKey = Object.prototype.hasOwnProperty.call(oldItem, "sizes");
  const sentSizes = Object.prototype.hasOwnProperty.call(incoming, "sizes");

  if (!sentSizes) return hadSizesKey ? oldItem.sizes || [] : undefined;

  // Admin sends [{name, price}]
  const arr = Array.isArray(incoming.sizes) ? incoming.sizes : [];
  const norm = arr
    .map((s) => ({
      name: String(s?.name || "").trim(),
      price: Number(s?.price) || 0,
    }))
    .filter((s) => s.name);
  // If admin sent empty but file had sizes before, keep old
  // if (norm.length === 0 && hadSizesKey) return oldItem.sizes || [];
  // If admin sent empty and file never had sizes, omit the key
  // if (norm.length === 0 && !hadSizesKey) return undefined;
  // If admin explicitly sent empty, CLEAR sizes
  if (norm.length === 0) return [];
  return norm;
}

// Avoid creating duplicates of "Speciella instruktioner" and preserve type/value
function mergeModifiers(oldItem, incoming) {
  const hadModsKey = Object.prototype.hasOwnProperty.call(oldItem, "modifiers");
  const sentMods = Object.prototype.hasOwnProperty.call(incoming, "modifiers");
  if (!sentMods) return hadModsKey ? oldItem.modifiers || [] : undefined;

  const oldGroups = Array.isArray(oldItem.modifiers) ? oldItem.modifiers : [];

  const newGroups = (incoming.modifiers || []).map((g) => {
    const title = String(g.title || g.name || "").trim();
    const prev = oldGroups.find((og) => (og.title || og.name || "") === title);

    // infer/preserve type
    let type = prev?.type || g.__type || null;
    if (!type) {
      if (/speciell/i.test(title)) type = "textarea";
      else if (/deg|välj/i.test(title)) type = "radio";
      else type = "checkbox";
    }

    if (type === "textarea") {
      return {
        type,
        title,
        placeholder: prev?.placeholder || "T.ex. ingen lök, extra sås …",
        optional: true,
      };
    }

    const options = (g.options || []).map((o) => {
      const label = String(o.name || o.label || "").trim();
      const price = Number(o.price) || 0;
      const oPrev = prev?.options?.find(
        (po) => (po.label || po.name) === label
      );
      const value = oPrev?.value || slugify(label);
      return { label, value, price };
    });

    return { type, title, options };
  });

  // If neither incoming nor old had a textarea, add exactly one
  const hasTextarea = (arr) =>
    Array.isArray(arr) && arr.some((x) => x.type === "textarea");
  if (!hasTextarea(newGroups) && !hasTextarea(oldGroups)) {
    newGroups.push({
      type: "textarea",
      title: "Speciella instruktioner",
      placeholder: "T.ex. ingen lök, extra sås …",
      optional: true,
    });
  }

  return newGroups;
}

function toDbModifierGroups(staticMods = []) {
  const groups = Array.isArray(staticMods) ? staticMods : [];
  return groups
    .filter((g) => {
      const title = String(g?.name || g?.title || "").trim();
      const typeIn = String(g?.type || "").toLowerCase();
      // DROP textarea / "Speciella instruktioner" so we don't duplicate later
      if (typeIn === "textarea") return false;
      if (/speciell/i.test(title)) return false;
      return true;
    })
    .map((g) => ({
      name: g.name || g.title, // map "title" -> "name"
      options: (Array.isArray(g.options) ? g.options : []).map((o) => ({
        name: o.name || o.label || "", // map "label" -> "name"
        price: Number(o.price) || 0,
      })),
    }));
}

// admin modifier: { title, options:[{ name, price }] }
function toAdminModifiers(customerMods = []) {
  return (customerMods || []).map((g) => ({
    title: g.title || g.name || "",
    options: (g.options || []).map((o) => ({
      name: o.name || o.label || "",
      price: Number(o.price) || 0,
    })),
    // optional: keep original type if present
    __type: g.type || null,
  }));
}

function normItem(it, source = "db") {
  return {
    _id: it._id ? String(it._id) : undefined,
    id: it.id || (it._id ? String(it._id) : undefined),
    name: it.name || it.title || "",
    price: Number(it.price ?? 0),
    image: it.imageUrl || it.image || "/assets/images/default-food.jpg",
    category: it.category || "",
    page: it.page || null,
    description: it.description || it.desc || "",
    sizes: Array.isArray(it.sizes) ? it.sizes : [],
    modifiers:
      source === "static"
        ? toAdminModifiers(it.modifiers)
        : Array.isArray(it.modifiers)
        ? it.modifiers
        : [],
    source,
    available: true, // will be overridden by Availability later
  };
}

// Map static modifiers { title, options:[{name, price}] } -> DB-like then -> UI-like
function staticToPublic(s = {}) {
  return {
    id: String(s.id || ""),
    name: s.name || s.title || "",
    desc: s.description || s.desc || "",
    price:
      Array.isArray(s.sizes) && s.sizes.length
        ? pickDisplayPrice(s.sizes)
        : Number(s.price || 0),
    image: s.image || s.imageUrl || "/assets/images/default-food.jpg",
    category: s.category || "", // pass-through
    page: s.page || null,
    sizes: Array.isArray(s.sizes) ? s.sizes : [],
    // use the global helper here
    modifiers: mapModifiers(toDbModifierGroups(s.modifiers)),
  };
}

/* ---------- STATIC items: GET one, UPDATE, DELETE (by slug id) ---------- */
// GET /api/admin/menu/static/:id  → read a static item (for opening modal)
router.get("/static/:id", adminAuth, async (req, res) => {
  const slug = String(req.params.id || "").trim();
  const s = STATIC_MENU.find((x) => String(x.id) === slug);
  if (!s)
    return res
      .status(404)
      .json({ success: false, error: "Static item not found" });

  // return in your admin “normItem” shape so the modal can fill cleanly
  return res.json({ success: true, item: normItem(s, "static") });
});

// PUT /api/admin/menu/static/:id  → edit static and write back to JSON
router.put("/static/:id", adminAuth, async (req, res) => {
  const slug = String(req.params.id || "").trim();
  const idx = STATIC_MENU.findIndex((x) => String(x.id) === slug);
  if (idx === -1) {
    return res
      .status(404)
      .json({ success: false, error: "Static item not found" });
  }

  // accept raw JSON or { data: ... }
  const body =
    typeof req.body === "object" && req.body ? req.body.data || req.body : {};
  const current = STATIC_MENU[idx];

  // ---- primitives (preserve original description key: desc vs description)
  const next = { ...current };
  next.id = current.id; // keep slug stable
  next.name = body.name ?? current.name ?? current.title ?? "";
  next.price = Number.isFinite(+body.price) ? +body.price : current.price ?? 0;
  next.category = body.category ?? current.category ?? "";
  next.image =
    body.image ?? body.imageUrl ?? current.image ?? current.imageUrl ?? "";
  next.page = body.page ?? current.page ?? null;

  // prefer whichever key the file originally used
  const hadDesc = Object.prototype.hasOwnProperty.call(current, "desc");
  const hadDescription = Object.prototype.hasOwnProperty.call(
    current,
    "description"
  );
  const newDescValue =
    body.description ?? body.desc ?? current.desc ?? current.description ?? "";

  if (hadDesc && !hadDescription) {
    next.desc = newDescValue;
    delete next.description;
  } else if (!hadDesc && hadDescription) {
    next.description = newDescValue;
    delete next.desc;
  } else {
    // both existed or neither existed → prefer "desc" for static files
    next.desc = newDescValue;
    delete next.description;
  }

  // ---- arrays (merge; only set keys when needed)
  const mergedSizes = mergeSizes(current, body); // may be array OR undefined (omit key)
  if (typeof mergedSizes !== "undefined") next.sizes = mergedSizes;
  else delete next.sizes;

  const mergedMods = mergeModifiers(current, body); // may be array OR undefined (omit key)
  if (typeof mergedMods !== "undefined") next.modifiers = mergedMods;
  else delete next.modifiers;

  // ---- validation: need base price or at least one size (use effective values)
  const hasBase = Number(next.price) > 0;
  const hasSizes = Array.isArray(next.sizes) && next.sizes.length > 0;
  if (!hasBase && !hasSizes) {
    return res.status(400).json({
      success: false,
      error: "Provide base price or at least one size.",
    });
  }

  // ---- persist
  STATIC_MENU[idx] = next;
  saveStaticMenu();

  // ---- live update for clients (send PUBLIC/UI shape), admin gets admin shape
  const payload = staticToPublic(next); // includes textarea via mapModifiers
  payload._id = String(next.id || ""); // help client match either field
  payload.id = String(next.id || payload.id || "");
  const io = req.app.get("io");
  io?.emit("menu:update", payload);

  return res.json({ success: true, item: normItem(next, "static") });
});

// DELETE /api/admin/menu/static/:id  → remove static item from JSON
router.delete("/static/:id", adminAuth, async (req, res) => {
  const slug = String(req.params.id || "").trim();
  const idx = STATIC_MENU.findIndex((x) => String(x.id) === slug);
  if (idx === -1)
    return res
      .status(404)
      .json({ success: false, error: "Static item not found" });

  const [deleted] = STATIC_MENU.splice(idx, 1);
  saveStaticMenu();

  const io = req.app.get("io");
  io?.emit("menu:delete", { _id: deleted.id }); // your client listens for _id

  return res.json({
    success: true,
    deleted: { id: deleted.id, name: deleted.name },
  });
});

// List (admin) — merged DB + static, searchable
router.get("/", adminAuth, async (req, res) => {
  try {
    const { category = "", q = "", includeStatic = "1" } = req.query;

    // 1) DB items
    const filter = {};
    if (category) filter.category = category;
    if (q) filter.name = { $regex: q, $options: "i" };
    const dbDocs = await MenuItem.find(filter)
      .sort({ sort: 1, createdAt: -1 })
      .lean();
    let items = dbDocs.map((d) => normItem(d, "db"));

    // 2) Static items
    if (includeStatic === "1") {
      const staticItems = STATIC_MENU.map((s) => normItem(s, "static"));
      const map = new Map(items.map((i) => [i.id, i])); // DB wins on same id
      for (const s of staticItems) if (s.id && !map.has(s.id)) map.set(s.id, s);
      items = Array.from(map.values());
    }

    // 3) Apply filters to merged list too (so static is searchable)
    const qlc = String(q).trim().toLowerCase();
    if (category) items = items.filter((i) => (i.category || "") === category);
    if (qlc) {
      items = items.filter(
        (i) =>
          (i.name || "").toLowerCase().includes(qlc) ||
          (i.category || "").toLowerCase().includes(qlc) ||
          (i.id || "").toLowerCase().includes(qlc)
      );
    }

    // 4) Overlay availability
    const overrides = await Availability.find(
      {},
      { _id: 0, id: 1, available: 1 }
    ).lean();
    const aMap = new Map(overrides.map((o) => [String(o.id), !!o.available]));
    items.forEach((i) => {
      if (aMap.has(String(i.id))) i.available = aMap.get(String(i.id));
    });

    res.json({ success: true, items });
  } catch (e) {
    console.error("/api/admin/menu merged error:", e);
    res.status(500).json({ success: false, error: "Failed to load menu" });
  }
});

// POST /api/admin/menu/import/:id  -> create DB record from static catalog and return it
router.post("/import/:id", adminAuth, async (req, res) => {
  try {
    const staticId = String(req.params.id).trim();
    // find in STATIC_MENU
    const s = STATIC_MENU.find((x) => String(x.id) === staticId);
    if (!s)
      return res
        .status(404)
        .json({ success: false, error: "Static item not found" });

    // if already in DB, return existing
    let existing = await MenuItem.findOne({ id: staticId }).lean();
    if (existing) {
      return res.json({ success: true, item: existing, imported: false });
    }

    // create new DB doc from static
    const payload = {
      id: staticId,
      name: s.name || s.title || "",
      price: Number(s.price ?? 0),
      category: s.category || "",
      page: s.page || null,
      description: s.description || s.desc || "",
      imageUrl: s.image || s.imageUrl || "",
      sizes: Array.isArray(s.sizes) ? s.sizes : [],
      modifiers: toDbModifierGroups(s.modifiers),
    };

    const created = await MenuItem.create(payload);
    return res.json({
      success: true,
      item: created.toObject(),
      imported: true,
    });
  } catch (e) {
    console.error("import static → db error:", e);
    res
      .status(500)
      .json({ success: false, error: "Failed to import static item" });
  }
});

// PUBLIC: combined menu (DB + static) for the customer UI
// This route has NO adminAuth.
router.get("/public-menu", async (req, res) => {
  try {
    // 1) DB items
    const dbDocs = await MenuItem.find({}).sort({ sort: 1 }).lean();
    const dbList = dbDocs.map((d) => ({
      id: d.id || String(d._id),
      name: d.name || "",
      desc: d.description || "",
      price:
        Array.isArray(d.sizes) && d.sizes.length
          ? pickDisplayPrice(d.sizes)
          : Number(d.price || 0),
      image: d.imageUrl || "/assets/images/default-food.jpg",
      category: d.category || "", // ← pass-through
      sizes: Array.isArray(d.sizes) ? d.sizes : [],
      modifiers: mapModifiers(d.modifiers),
      sort: Number(d.sort || 0),
      page: d.page || null,
    }));

    // 2) Static items (already loaded into STATIC_MENU)
    const staticList = (STATIC_MENU || []).map((s) => ({
      id: String(s.id || ""),
      name: s.name || s.title || "",
      desc: s.description || s.desc || "",
      price:
        Array.isArray(s.sizes) && s.sizes.length
          ? pickDisplayPrice(s.sizes)
          : Number(s.price || 0),
      image: s.image || s.imageUrl || "/assets/images/default-food.jpg",
      category: s.category || "", // ← pass-through
      sizes: Array.isArray(s.sizes) ? s.sizes : [],
      // convert static-style modifiers to DB-like → UI-like
      modifiers: mapModifiers(toDbModifierGroups(s.modifiers)),
      sort: Number(s.sort || 0),
      page: s.page || null,
    }));

    const items = [...staticList, ...dbList].sort((a, b) => a.sort - b.sort);
    res.json({ success: true, items });
  } catch (e) {
    console.error("public-menu error:", e);
    res.status(500).json({ success: false, error: "Failed to load menu" });
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
    if (e?.name === "CastError") {
      return res.status(400).json({ success: false, error: "Invalid item id" });
    }
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    // Accept both multipart (payload/data) and raw JSON
    const body = req.file
      ? JSON.parse(req.body.payload || req.body.data || "{}")
      : typeof req.body === "object" && req.body
      ? req.body.data || req.body.payload || req.body
      : {};
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
// PUT /api/admin/menu/:id
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const _id = req.params.id;
    const body = req.file ? JSON.parse(req.body.payload || "{}") : req.body;

    const update = {
      // primitives you allow to change
      ...(body.name !== undefined && { name: String(body.name).trim() }),
      ...(body.slug !== undefined && {
        slug: slugify(body.slug || body.name || ""),
      }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.price !== undefined && { price: Number(body.price) || 0 }),
      ...(body.description !== undefined && {
        description: body.description || "",
      }),
      ...(body.available !== undefined && { available: !!body.available }),
    };

    // complex arrays: set ONLY if provided
    if (Array.isArray(body.sizes)) update.sizes = body.sizes;
    if (Array.isArray(body.modifiers)) update.modifiers = body.modifiers;

    // keep existing image unless a new file is uploaded
    if (req.file) update.imageUrl = `/uploads/${req.file.filename}`;

    const item = await MenuItem.findByIdAndUpdate(
      _id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!item)
      return res.status(404).json({ success: false, error: "Not found" });
    // 🔔 notify customer UI so index.html (and other pages) update immediately
    req.app.get("io")?.emit("menu:update", toPublicItem(item));
    res.json({ success: true, item });
  } catch (e) {
    console.error("PUT /api/admin/menu/:id error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const param = String(req.params.id).trim();
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);
    const query = isMongoId ? { _id: param } : { id: param };
    const item = await MenuItem.findOneAndDelete(query);
    if (!item)
      return res.status(404).json({ success: false, error: "Not found" });

    // notify clients
    req.app
      .get("io")
      ?.emit("menu:delete", { _id: item._id?.toString?.() || item.id });

    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/menu/:id error:", e);
    res.status(500).json({ success: false, error: e.message });
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
