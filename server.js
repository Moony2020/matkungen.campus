// server.js
require("dotenv").config();

// ======Basic imports ======
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");

// ====== project imports ======
const bcrypt = require("bcrypt");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const paypal = require("@paypal/checkout-server-sdk");

const connectDB = require("./config/db");
const { verifyToken } = require("./config/jwt");
const User = require("./models/User");
const Order = require("./models/Order");

const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");
const adminAuth = require("./middleware/adminAuth");

// Utility functions for PDF and email
const createReceiptPdf = require("./utils/createPdf");
const { sendOrderEmail } = require("./utils/sendEmail"); // uses its own transporter or you can wire to the above
const menuRoutes = require("./routes/menu");
const MenuItem = require("./models/MenuItem"); // adjust path to MenuItem model
const router = express.Router();
const settingsRoutes = require("./routes/settings");
const Setting = require("./models/Setting");
const Availability = require("./models/Availability");

// ---------- APP_URL base URL (single source of truth) ----------
const APP_URL = (
  process.env.APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://matkungen-campus.onrender.com"
    : `https://localhost:${process.env.PORT || 4000}`)
).replace(/\/+$/, ""); // strip any trailing slash

// additional use a public URL for email (logo) assets/links (fallback to prod if APP_URL is local)
const EMAIL_BASE_URL = (
  process.env.PROD_APP_URL || "https://matkungen-campus.onrender.com"
).replace(/\/+$/, "");

// ---------- Opening Hours ----------
const OPENING_HOURS = {
  0: [{ start: 12 * 60, end: 3 * 60, overnight: true }], // Sun 12:00–22:00
  1: [{ start: 11 * 60, end: 3 * 60, overnight: true }], // Mon 11:00–22:00
  2: [{ start: 11 * 60, end: 3 * 60, overnight: true }], // Tue 11:00–22:00
  3: [{ start: 10 * 60, end: 3 * 60, overnight: true }], // Wed 11:00–03:00 (Thu)
  4: [{ start: 10 * 60, end: 24 * 60 }], // Thu 11:00–22:00
  5: [{ start: 9 * 60, end: 3 * 60, overnight: true }], // Fri 11:00–03:00 (Sat)
  6: [{ start: 12 * 60, end: 3 * 60, overnight: true }], // Sat 12:00–03:00 (Sun)
};

function getStockholmParts() {
  const now = new Date();
  const hm = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
  })
    .format(now)
    .toLowerCase();

  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const day = map[weekday.slice(0, 3)] ?? new Date().getDay();
  return { day, minutes: h * 60 + m };
}

function isOpenNowServer() {
  const { day, minutes } = getStockholmParts();
  const today = OPENING_HOURS[day] || [];
  for (const itv of today) {
    if (!itv.overnight && minutes >= itv.start && minutes < itv.end)
      return true;
    if (itv.overnight && minutes >= itv.start) return true;
  }
  const prev = (day + 6) % 7;
  const prevInts = OPENING_HOURS[prev] || [];
  for (const itv of prevInts) {
    if (itv.overnight && minutes < itv.end) return true;
  }
  return false;
}

function blockWhenClosed(req, res, next) {
  if (isOpenNowServer()) return next();
  return res.status(403).json({
    success: false,
    error: "We are currently closed. Please order during opening hours.",
  });
}

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
  const arr = Array.isArray(dbGroups) ? dbGroups : [];
  const mapped = arr.map((g) => {
    const isRadio = !!g.required && (g.max === 1 || g.min === 1);
    return {
      title: g.name, // ← frontend expects 'title'
      type: isRadio ? "radio" : "checkbox",
      required: !!g.required,
      min: Number(g.min) || 0,
      max: Number(g.max) || 0,
      options: (Array.isArray(g.options) ? g.options : []).map((o) => ({
        label: o.name, // ← frontend expects 'label'
        value: slugify(o.name),
        price: Number(o.price) || 0,
      })),
    };
  });
  //  add special instructions note at the end of the modifiers model
  mapped.push({
    title: "Speciella instruktioner",
    type: "textarea",
    placeholder: "T.ex. ingen lök, extra sås …",
  });

  return mapped;
}
// ---------- DB ----------
connectDB();

const stripSlash = (u) => (u ? u.replace(/\/+$/, "") : u);
const allowedOrigins = [
  process.env.APP_URL && stripSlash(process.env.APP_URL), // e.g. https://matkungen-campus.onrender.com
  "https://localhost:4000", // mkcert local HTTPS
  "https://127.0.0.1:4000", // optional local
].filter(Boolean); // remove empty strings

// ---------- App / Middleware ----------
const app = express();

// (optional) Disable 'X-Powered-By' header (security best practice)
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(cookieParser()); // ✅ correct place (after app = express)

// helper: check allowed
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin/curl/Postman
  const clean = stripSlash(origin);
  // optionally allow *.onrender.com subdomains:
  try {
    const { hostname } = new URL(clean);
    if (hostname.endsWith(".onrender.com")) return true; // optional
  } catch {
    /* ignore */
  }
  return allowedOrigins.includes(clean);
}

app.use(express.json());
// serve uploads statically
app.use(
  "/uploads",
  express.static(path.join(__dirname, "public", "uploads"), {
    maxAge: "30d",
    etag: true,
  })
);

// ====== Apply CORS to REST BEFORE any app.use('/api/admin/...') routes======
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      cb(null, isAllowedOrigin(origin));
    }, // allow requests from allowed origins
    credentials: true, // allow session cookie from browser to pass through
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);

// (optional) Good to have: explicit preflight handler
app.options("*", cors());
router.options("/:id", cors());

// mount admin APIs routes
app.use("/api/admin/menu", menuRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/admin/settings", settingsRoutes);
// 📂
// Serve only the public folder "assets all (images, JS, CSS and html files…)"
const dev = process.env.NODE_ENV !== "production";

app.use(
  "/assets",
  express.static(
    path.join(__dirname, "public", "assets"),
    dev
      ? {
          etag: false,
          lastModified: false,
          maxAge: 0,
          setHeaders: (res) => res.set("Cache-Control", "no-store"),
        }
      : {
          etag: true,
          lastModified: true,
          maxAge: "7d",
        }
  )
);

// ---------- TEMP DEBUG ROUTES ----------
app.get("/api/debug-email", async (req, res) => {
  try {
    const info = await sendOrderEmail({
      to: process.env.EMAIL_USER,
      subject: "Matkungen debug email",
      html: "<p>If you can read this, SMTP works in production.</p>",
    });
    console.log(
      "✅ /api/debug-email sent →",
      process.env.EMAIL_USER,
      info.messageId
    );
    res.json({ ok: true, id: info.messageId, to: process.env.EMAIL_USER });
  } catch (e) {
    console.error("❌ /api/debug-email:", e?.message || e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ====== health/debug  ======
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV,
    appUrl: APP_URL,
    emailFrom: process.env.EMAIL_FROM,
  });
});

// Public store status payload for the customer site
app.get("/api/store", async (req, res) => {
  try {
    const storeDoc = await Setting.findOne({ key: "store" }); // { mode, channels, busyMessage }
    const hoursDoc = await Setting.findOne({ key: "hours" }); // { mon:[{open:"11:00",close:"22:00"}], ... }
    const channelsDoc = await Setting.findOne({ key: "channels" }); // optional per-channel flags

    const store = storeDoc?.value || {};
    const hours = hoursDoc?.value || {};
    const channels = channelsDoc?.value ||
      store.channels || { pickup: true, delivery: true };

    res.json({
      value: {
        ...store, // mode, busyMessage, etc.
        hours,
        channels,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/menu", async (req, res) => {
  try {
    const docs = await MenuItem.find({ isActive: true })
      .lean()
      .sort({ sort: 1, createdAt: 1 });

    const items = docs.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      desc: d.description || "",
      price:
        d.price ??
        (Array.isArray(d.sizes) && d.sizes[0] ? d.sizes[0].price : 0),
      image: d.imageUrl || "/assets/images/default-food.jpg",
      category: d.category, // ← no normalize here
      sizes: Array.isArray(d.sizes) ? d.sizes : [],
      modifiers: mapModifiers(d.modifiers),
    }));

    res.json({ success: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Failed to load menu" });
  }
});

// --- Availability overrides API ---
// Store per-item overrides here: { id: "vegetariana", available: true/false }

app.get("/api/availability", async (req, res) => {
  try {
    const rows = await Availability.find({}).lean();
    res.json({
      overrides: rows.map((r) => ({
        id: String(r.id),
        available: !!r.available,
      })),
    });
  } catch (e) {
    console.error(e);
    res.json({ overrides: [] });
  }
});

// POST /api/availability  (toggle availability for any item id)
// Requires admin; uses cookie/session or token depending on your setup
app.post("/api/availability", adminAuth, async (req, res) => {
  try {
    let { id, available } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, error: "Missing id" });
    }

    // normalize
    id = String(id).trim();
    // Accept booleans or strings like "true"/"false"
    if (typeof available !== "boolean") {
      if (typeof available === "string") {
        available = available.toLowerCase() === "true";
      } else {
        available = !!available;
      }
    }

    const update = {
      id,
      available,
      updatedAt: new Date(),
    };

    await Availability.updateOne({ id }, { $set: update }, { upsert: true });

    // broadcast live change
    if (typeof io !== "undefined" && io) {
      io.emit("availability:update", { id, available });
    }

    return res.json({ success: true, override: update });
  } catch (e) {
    console.error("POST /api/availability error:", e);
    return res.status(500).json({
      success: false,
      error: e?.message || "Internal server error",
    });
  }
});

app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"], // serve index.html for /checkout etc.
    index: "index.html", // default file
  })
);

// Helmet for security headers (keep CSP disabled if you use inline scripts/styles in your frontend HTML)
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for inline <script> / <style> would otherwise be blocked.When i remove inline scripts/styles from html, enable/switch back CSP
    crossOriginEmbedderPolicy: false, // Disable COEP  because it breaks third-party embeds unless everything is CORS/COEP compatible.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Allow popups (e.g., PayPal) while keeping same-origin isolation for most cases.
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Permit loading images/fonts/media from other origins (CDNs, etc.).
  })
);

// HSTS only in production and only when behind HTTPS
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet.hsts({
      maxAge: 15552000, // 180 days (in seconds)
      includeSubDomains: true, // also enforce on subdomains
      preload: false, // set to true only after submitting to hstspreload.org
    })
  );
}

// ====== Force HTTPS in production  (optional but good) behind proxy ======
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] === "http") {
      return res.redirect(301, "https://" + req.headers.host + req.originalUrl);
    }
    next();
  });
}

// ====== Rate limiting (optional but good) ======
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per order IP
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Data sanitization against NoSQL injection and XSS attacks
app.use(mongoSanitize());
app.use(xss());

// use HTTPS in local dev with mkcert? (also set APP_URL to https://localhost:4000 in .env)
const isDev = process.env.NODE_ENV !== "production";
let server;

if (isDev) {
  const keyPath = path.join(__dirname, "certs", "localhost-key.pem");
  const certPath = path.join(__dirname, "certs", "localhost-cert.pem");

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    server = https.createServer(
      { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
      app
    );
    console.log("🔐 Using local HTTPS (mkcert).");
  } else {
    server = http.createServer(app);
    console.log("ℹ️ Certs not found → local HTTP fallback.");
  }
} else {
  // production: plain HTTP (behind proxy that does HTTPS)
  server = http.createServer(app);
}

// CORS for Socket.IO
// Socket.IO on the SAME `server`
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    // In dev you can just use `true`; in prod keep your isAllowedOrigin check
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl
      cb(null, isAllowedOrigin(origin)); // your whitelist fn
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  // Try WebSocket first, fall back to polling (quietes console noise)
  transports: ["websocket", "polling"],
  // Optional: make transient network hiccups less noisy
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
});

// Make io/app accessible from routes/others
app.set("io", io);

// ---------- Socket Handlers ----------

// ⬇️ io.use with cookie-based auth
io.use((socket, next) => {
  try {
    // read cookies from WS handshake
    const cookies = cookie.parse(socket.handshake.headers.cookie || "");
    const token = cookies.admin_token; // our HttpOnly cookie name

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.adminId = decoded.id; // optional: keep for admin-only rooms
    }

    // IMPORTANT: do NOT throw if no token — allow non-admin sockets too
    return next();
  } catch (e) {
    // also do not kill the connection; just continue unauthenticated
    return next();
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Admin room for admin dashboard updates
  socket.on("joinAdminRoom", () => {
    socket.join("admin");
    console.log(`Admin joined admin room: ${socket.id}`);
  });

  socket.on("joinUserRoom", (userId) => {
    if (userId) socket.join(userId);
  });

  socket.on("joinOrderRoom", (orderId) => {
    if (orderId) socket.join(orderId);
  });

  socket.on("updateDriverLocation", async ({ orderId, location }) => {
    try {
      await Order.findByIdAndUpdate(orderId, { "driver.location": location });
      io.to(orderId).emit("driverLocationUpdate", location);
    } catch (error) {
      console.error("Error updating driver location:", error);
    }
  });

  socket.on("orderStatusUpdate", (order) => {
    if (!order?._id) return;
    io.to(order._id.toString()).emit("orderUpdate", order);
    if (order.user) io.to(order.user.toString()).emit("orderUpdate", order);
  });

  socket.on("newOrder", (order) => {
    io.to("admin").emit("new-order", order); // send only to admins
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Central app-level listeners that actually send the emails
app.on("order:created", async (order) => {
  try {
    const to =
      order?.customer?.email?.trim() ||
      order?.email?.trim() || // fallback if ever stored flat
      "";
    if (!to) return; // keep the guard

    const pdfBuffer = await createReceiptPdf(order); // styled PDF
    await sendOrderEmail({
      to,
      subject: `Orderbekräftelse #${order.orderNumber} – Matkungen`,
      html: buildOrderEmailHtml(order), // 👈 use fancy HTML
      pdfBuffer,
    });
    console.log("✓ order:created email sent", to);
  } catch (e) {
    console.error("❌ order:created email failed:", e);
  }
});

app.on("order:paid", async (order) => {
  try {
    const to =
      order?.customer?.email?.trim() ||
      order?.email?.trim() || // fallback if ever stored flat
      "";
    if (!to) return; // keep the guard

    const pdfBuffer = await createReceiptPdf(order); // styled PDF
    await sendOrderEmail({
      to,
      subject: `Order #${order.orderNumber} Confirmed - Matkungen`,
      html: buildOrderEmailHtml(order), // 👈 use fancy HTML
      pdfBuffer,
    });
    console.log("✓ order:paid email sent", to);
  } catch (e) {
    console.error("❌ order:paid email failed:", e);
  }
});
function buildOrderEmailHtml(order) {
  // Determine if pickup or delivery , /pickup/i has the i flag → it matches pickup, Pickup, PICKUP, PickUp, etc., without you having to lowercase first.
  const isPickup =
    /pickup/i.test(String(order.fulfillmentMethod || order.orderType || "")) ||
    /avh[aä]mtning/i.test(order.customer?.address || "");

  //  const etaText = isPickup ? "10 minutes" : "20–35 minutes";
  const etaLabel = isPickup ? "Beräknad tid" : "Beräknad leveranstid";

  // Store location (edit if needed)
  const STORE_NAME = "Matkungen";
  const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
  const STORE_PHONE = "0769 666 666";
  const mapsUrl =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`${STORE_NAME}, ${STORE_ADDRESS}`);

  // Safe math
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal =
    typeof order.subtotal === "number"
      ? order.subtotal
      : items.reduce(
          (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
          0
        );

  const rawFee = Number(order.deliveryFee ?? 0);
  const deliveryFee = isPickup ? 0 : rawFee;
  const total = subtotal + deliveryFee;

  const feeText = deliveryFee === 0 ? "Gratis" : `${deliveryFee.toFixed(2)} kr`;
  const etaText = isPickup ? "10 minuter" : "20–35 minuter";
  const sectionTitle = isPickup
    ? "Upphämtningsinformation"
    : "Leveransinformation";

  const addressLine = isPickup
    ? `${STORE_NAME}, ${STORE_ADDRESS}`
    : order.customer?.address || "";

  const itemsHtml = items
    .map(
      (i) =>
        `<li style="margin-bottom:6px;">${i.name} × ${i.quantity} = ${(
          Number(i.price || 0) * Number(i.quantity || 0)
        ).toFixed(2)} kr</li>`
    )
    .join("");

  return `
  <div style="max-width:600px;margin:auto;font-family:'Segoe UI',sans-serif;color:#333;background:#fff;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;">
    <div style="background:#000;padding:20px;text-align:center;">
      <img src="${EMAIL_BASE_URL}/assets/images/logo.png" alt="Matkungen" style="height:60px;" onerror="this.style.display='none';" />
      <h2 style="margin:10px 0 0;color:#FFD700;">Matkungen</h2>
    </div>

    <div style="padding:24px 32px;text-align:center;background:#000;color:#FFD700;">
      <h2 style="margin:0;">Tack för din beställning, ${
        order.customer?.name || ""
      }!</h2>
      <p style="margin:5px 0 0;font-size:18px;">Order #${
        order.orderNumber
      } har mottagits och kommer att hanteras snart</p>
    </div>

    <div style="padding:24px 32px;">
      <h3 style="color:#000;margin-top:0;">Ordersammanfattning</h3>
      <ul style="padding-left:20px;margin:0 0 15px;">${itemsHtml}</ul>
      <p><strong>Delsumma:</strong> ${subtotal.toFixed(2)} kr</p>
      <p><strong>Leveransavgift:</strong> ${feeText}</p>
      <p style="font-size:18px;"><strong>Totalt:</strong> ${total.toFixed(
        2
      )} kr</p>
      <p><strong>Betalningsmetod:</strong> ${order.paymentMethod || "—"}</p>
    </div>

    <hr style="border:none;border-top:1px solid #e0e0e0;" />
    <div style="padding:24px 32px;">
      <h3 style="margin-top:0;">${sectionTitle}</h3>
      <p><strong>Namn:</strong> ${order.customer?.name || ""}</p>
      <p><strong>Telefon:</strong> ${order.customer?.phone || ""}</p>
      <p><strong>Adress:</strong> ${addressLine}</p>
      ${
        isPickup
          ? `<p><strong>Restaurangens telefon:</strong> ${STORE_PHONE}</p>`
          : ""
      }
      ${
        order.customer?.notes
          ? `<p><strong>Noteringar:</strong> ${order.customer.notes}</p>`
          : ""
      }
      <p><strong>${etaLabel}:</strong> ${etaText}</p>
    </div>

    ${
      isPickup
        ? `
    <div style="text-align:center;padding:20px;">
      <a href="${mapsUrl}" target="_blank"
         style="display:inline-block;padding:12px 24px;background:#FFD700;color:#000;font-weight:bold;text-decoration:none;border-radius:6px;">
        Visa karta
      </a>
    </div>`
        : `
    <div style="text-align:center;padding:20px;">
      <a href="${EMAIL_BASE_URL}/track-order.html?order=${encodeURIComponent(
            order.orderNumber
          )}"  target="_blank"
         style="display:inline-block;padding:12px 24px;background:#FFD700;color:#000;font-weight:bold;text-decoration:none;border-radius:6px;">
        Spåra din leverans
      </a>
    </div>`
    }

    <div style="padding:16px 32px;background:#f4f4f4;text-align:center;font-size:14px;color:#777;">
      <p style="margin:0;">📞 Behöver du hjälp? Ring <strong>${STORE_PHONE}</strong></p>
      <p style="margin:4px 0 0;">Matkungen © ${new Date().getFullYear()}</p>
    </div>
  </div>`;
}

// ---------- Routes ----------
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes); // mount ONCE
app.use("/api/admin", adminRoutes);

// Public pages
app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/admin", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);
app.get("/payment", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "payment.html"))
);
app.get("/reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

// ---------- Config endpoint ----------
app.get("/config", (req, res) => {
  res.json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
  });
});

// ---------- Stripe / PayPal (block when closed where relevant) ----------
app.post("/create-payment-intent", blockWhenClosed, async (req, res) => {
  try {
    const { amount, cardholderName } = req.body;
    if (!cardholderName || !cardholderName.trim()) {
      return res.status(400).json({ error: "Cardholder name is required" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: "sek",
      metadata: { cardholderName }, // for your records
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: "Failed to create payment intent" });
  }
});

const paypalClient = new paypal.core.PayPalHttpClient(
  new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_SECRET
  )
);

app.post("/create-paypal-order", blockWhenClosed, async (req, res) => {
  try {
    const { amount } = req.body;
    const request = new paypal.orders.OrdersCreateRequest();
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        { amount: { currency_code: "SEK", value: amount.toString() } },
      ],
    });
    const order = await paypalClient.execute(request);
    res.json({ orderID: order.result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/capture-paypal-order", async (req, res) => {
  try {
    const { orderID } = req.body;
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});
    const captureData = await paypalClient.execute(request);
    res.json(captureData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Payment confirmation (sends email via app event) ----------
// In the payment confirmation route in server.js
app.post("/api/orders/confirm-payment", async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: "Completed",
        status: "Confirmed",
        paymentMethod,
        $push: {
          statusHistory: {
            status: "Confirmed",
            note: `Payment successful via ${paymentMethod}`,
            changedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder)
      return res.status(404).json({ error: "Order not found" });

    // Get current date boundaries for stats calculation
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Calculate fresh stats for the dashboard
    const stats = {
      todayOrders: await Order.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
        paymentStatus: "Completed",
      }),
      pendingOrders: await Order.countDocuments({
        status: "Pending",
        paymentStatus: "Completed",
      }),
      revenue:
        (
          await Order.aggregate([
            {
              $match: {
                status: "Delivered",
                paymentStatus: "Completed",
                createdAt: { $gte: todayStart, $lt: todayEnd },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$total" },
              },
            },
          ])
        )[0]?.total || 0,
      newCustomers: await User.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
      }),
    };

    // Emit updated stats to all admins
    io.to("admin").emit("stats-update", stats);

    // Emit to admin room for chart update
    io.to("admin").emit("chart-update", {
      orderId: updatedOrder._id,
      newStatus: "Confirmed",
      isNewOrder: true, // Add flag to indicate this is a new order
    });

    // notify dashboards
    io.emit("new-order", updatedOrder);

    // email via centralized listener
    app.emit("order:paid", updatedOrder);

    // respond to client
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Payment confirmation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Admin APIs ----------
app.get("/api/admin/orders/:id", adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/orders", adminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 30 } = req.query;
    const query = {};

    if (status && status !== "all") query.status = status;

    if (search) {
      query.$or = [
        { "customer.name": { $regex: search, $options: "i" } },
        { "customer.phone": { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
      ];
    }

    const options = {
      page: Number(page) || 1,
      limit: Number(limit) || 30,
      sort: { createdAt: -1 },
    };

    // using mongoose-paginate-v2 in Order model
    let orders;
    if (typeof Order.paginate === "function") {
      orders = await Order.paginate(query, options);
    } else {
      const docs = await Order.find(query)
        .sort(options.sort)
        .limit(options.limit)
        .skip((options.page - 1) * options.limit);

      const total = await Order.countDocuments(query);
      orders = {
        docs,
        page: options.page,
        totalPages: Math.ceil(total / options.limit),
        hasPrevPage: options.page > 1,
        hasNextPage: options.page < Math.ceil(total / options.limit),
      };
    }

    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/stats", adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const stats = {
      todayOrders: await Order.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
        paymentStatus: "Completed",
      }),
      pendingOrders: await Order.countDocuments({
        status: "Pending",
        paymentStatus: "Completed",
      }),
      revenue:
        (
          await Order.aggregate([
            {
              $match: {
                status: "Delivered",
                paymentStatus: "Completed",
                createdAt: { $gte: todayStart, $lt: todayEnd },
              },
            },
            { $group: { _id: null, total: { $sum: "$total" } } },
          ])
        )[0]?.total || 0,
      newCustomers: await User.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
      }),
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error("Stats calculation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to calculate stats",
      details: error.message,
    });
  }
});

// ----------  auth (if you still want these here) ----------
// app.post("/api/register", async (req, res) => {
//   try {
//     const { name, email, password } = req.body;
//     const existingUser = await User.findOne({ email });
//     if (existingUser)
//       return res.status(400).json({ error: "Email already registered" });

//     const user = await User.create({ name, email, password });
//     const token = user.generateAuthToken();

//     res.status(201).json({
//       success: true,
//       token,
//       user: { id: user._id, name: user.name, email: user.email },
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post("/api/login", async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email });
//     if (!user)
//       return res.status(401).json({ error: "Incorrect email or password." });

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch)
//       return res.status(401).json({ error: "Incorrect email or password." });

//     const token = user.generateAuthToken();
//     res.json({
//       success: true,
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         phone: user.phone,
//         address: user.address,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// ---------- Password reset using centralized transporter ----------
// app.post("/api/forgot-password", async (req, res) => {
//   try {
//     const { email } = req.body;
//     const user = await User.findOne({ email });
//     if (!user) return res.status(404).json({ error: "User not found" });

//     const resetToken = user.getResetPasswordToken();
//     await user.save();

//     const resetUrl = `${APP_URL}/reset-password/${resetToken}`;
//     const message = `
//       <h2>Password Reset Request</h2>
//       <p>You requested a password reset for your <strong>Matkungen</strong> account.</p>
//       <p>
//         <a href="${resetUrl}" style="display:inline-block; padding:10px 20px; background-color:#4CAF50; color:#ffffff; text-decoration:none; border-radius:5px;">
//           Click here to reset your password
//         </a>
//       </p>
//       <p>This link will expire in 10 minutes.</p>
//     `;

//     await transporter.sendMail({
//       from: `"Matkungen" <${process.env.EMAIL_USER}>`,
//       to: user.email,
//       subject: "Password Reset Request",
//       html: message,
//     });

//     res.json({ success: true, message: "Password reset email sent" });
//   } catch (error) {
//     console.error("Forgot password error:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// app.put("/api/reset-password/:token", async (req, res) => {
//   try {
//     const { token } = req.params;
//     const { password } = req.body;

//     const resetPasswordToken = crypto
//       .createHash("sha256")
//       .update(token)
//       .toString("hex");
//     const user = await User.findOne({
//       resetPasswordToken,
//       resetPasswordExpire: { $gt: Date.now() },
//     });

//     if (!user)
//       return res.status(400).json({ error: "Invalid or expired token" });

//     user.password = password;
//     user.resetPasswordToken = undefined;
//     user.resetPasswordExpire = undefined;
//     await user.save();

//     res.json({ success: true, message: "Password updated successfully" });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Admin reset password page
app.get("/admin-reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-reset-password.html"));
});

// ---------- Start ----------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running on https://localhost:${PORT}`);
});
