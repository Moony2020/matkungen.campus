// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const paypal = require("@paypal/checkout-server-sdk");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const connectDB = require("./config/db");
const { verifyToken } = require("./config/jwt");
const User = require("./models/User");
const Order = require("./models/Order");

const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");

// Utility functions for PDF and email
const createReceiptPdf = require("./utils/createPdf");
const sendOrderEmail = require("./utils/sendEmail"); // uses its own transporter or you can wire to the above

// ---------- Opening Hours ----------
const OPENING_HOURS = {
  0: [{ start: 12 * 60, end: 22 * 60 }], // Sun 12:00–22:00
  1: [{ start: 11 * 60, end: 22 * 60 }], // Mon 11:00–22:00
  2: [{ start: 11 * 60, end: 22 * 60 }], // Tue 11:00–22:00
  3: [{ start: 11 * 60, end: 3 * 60, overnight: true }], // Wed 11:00–03:00 (Thu)
  4: [{ start: 11 * 60, end: 3 * 22 * 60 }], // Thu 11:00–22:00
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

// ---------- DB ----------
connectDB();

// ---------- App / Middleware ----------
const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// ---------- HTTP + Socket.IO ----------
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Make io/app accessible from routes/others
app.set("io", io);
module.exports = { io, app };

// ---------- Socket Handlers ----------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = verifyToken(token);
      socket.adminId = decoded.id;
    } catch (err) {
      return next(new Error("Invalid token"));
    }
  }
  next();
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

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
    io.emit("newOrderNotification", order);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ---------- Mailer (centralized) ----------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }, // app password
  tls: {
    rejectUnauthorized: false, // ⚠️ DEV ONLY
  },
});

transporter
  .verify()
  .then(() => console.log("✉️  Mailer ready:", process.env.EMAIL_USER))
  .catch((err) => console.error("❌ Mailer verify failed:", err));

// Central app-level listeners that actually send the emails
app.on("order:created", async (order) => {
  try {
    const to = order?.customer?.email?.trim();
    if (!to) return;

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
    const to = order?.customer?.email?.trim();
    if (!to) return;

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
  const itemsHtml = (order.items || [])
    .map(
      (i) =>
        `<li style="margin-bottom:6px;">${i.name} × ${i.quantity} = ${(
          i.price * i.quantity
        ).toFixed(2)} kr</li>`
    )
    .join("");

  const FRONTEND = process.env.FRONTEND_URL || "http://localhost:4000";

  return `
  <div style="max-width:600px;margin:auto;font-family:'Segoe UI',sans-serif;color:#333;background:#fff;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;">
    <div style="background:#000;padding:20px;text-align:center;">
      <img src="${FRONTEND}/assets/images/logo.png" alt="Matkungen" style="height:60px;" onerror="this.style.display='none';" />
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
      <h3 style="color:#000;margin-top:0;">Order Summary:</h3>
      <ul style="padding-left:20px;margin:0 0 15px;">${itemsHtml}</ul>
      <p><strong>Subtotal:</strong> ${(order.subtotal ?? 0).toFixed(2)} kr</p>
      <p><strong>Delivery Fee:</strong> ${(order.deliveryFee ?? 0).toFixed(
        2
      )} kr</p>
      <p style="font-size:18px;"><strong>Total:</strong> ${(
        order.total ?? 0
      ).toFixed(2)} kr</p>
      <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
    </div>

    <hr style="border:none;border-top:1px solid #e0e0e0;" />
    <div style="padding:24px 32px;">
      <h3 style="margin-top:0;">Delivery Information</h3>
      <p><strong>Name:</strong> ${order.customer?.name || ""}</p>
      <p><strong>Phone:</strong> ${order.customer?.phone || ""}</p>
      <p><strong>Address:</strong> ${order.customer?.address || ""}</p>
      ${
        order.customer?.notes
          ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>`
          : ""
      }
      <p><strong>Estimated Delivery:</strong> 20-35 minutes</p>
    </div>

    <div style="text-align:center;padding:20px;">
      <a href="${FRONTEND}/track-order.html?order=${
    order.orderNumber
  }" target="_blank"
         style="display:inline-block;padding:12px 24px;background:#FFD700;color:#000;font-weight:bold;text-decoration:none;border-radius:6px;">
        Track Your Order
      </a>
    </div>

    <div style="padding:16px 32px;background:#f4f4f4;text-align:center;font-size:14px;color:#777;">
      <p style="margin:0;">📞 Need help? Call us at <strong>0769 666 666</strong></p>
      <p style="margin:4px 0 0;">Matkungen © ${new Date().getFullYear()}</p>
    </div>
  </div>`;
}

// ---------- Routes ----------
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes); // mount ONCE
app.use("/api/admin", adminRoutes);

// Public pages
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin", (_, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/payment", (_, res) =>
  res.sendFile(path.join(__dirname, "payment.html"))
);
app.get("/reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "reset-password.html"));
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
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: "sek",
      payment_method_types: ["card"],
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

// ---------- Admin auth middleware ----------
const adminAuth = (req, res, next) => {
  const token =
    req.header("x-auth-token") || req.headers.authorization?.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, error: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.role || !["admin", "superadmin"].includes(decoded.role)) {
      return res
        .status(403)
        .json({ success: false, error: "Admin privileges required" });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Token is not valid" });
  }
};

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
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { createdAt: -1 },
    };

    // If you use mongoose-paginate-v2 on Order:
    const orders = (await Order.paginate)
      ? Order.paginate(query, options)
      : Order.find(query).sort(options.sort).limit(options.limit);
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
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "Email already registered" });

    const user = await User.create({ name, email, password });
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Incorrect email or password." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Incorrect email or password." });

    const token = user.generateAuthToken();
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Password reset using centralized transporter ----------
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const resetToken = user.getResetPasswordToken();
    await user.save();

    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/reset-password/${resetToken}`;
    const message = `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your <strong>Matkungen</strong> account.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block; padding:10px 20px; background-color:#4CAF50; color:#ffffff; text-decoration:none; border-radius:5px;">
          Click here to reset your password
        </a>
      </p>
      <p>This link will expire in 10 minutes.</p>
    `;

    await transporter.sendMail({
      from: `"Matkungen" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Password Reset Request",
      html: message,
    });

    res.json({ success: true, message: "Password reset email sent" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .toString("hex");
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ error: "Invalid or expired token" });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin reset password page
app.get("/admin-reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-reset-password.html"));
});

// ---------- Start ----------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
