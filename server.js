require("dotenv").config();
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const paypal = require("@paypal/checkout-server-sdk");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const connectDB = require("./config/db");
const User = require("./models/User");
const Order = require("./models/Order");
const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");
const router = express.Router();
const http = require("http");
const socketIo = require("socket.io");
dotenv.config();

// Connect to MongoDB
connectDB();
const app = express();
// Middleware

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/api/admin", adminRoutes); // For admin orders

// Routes

app.use("/api/auth", authRoutes); // For register/login
app.use("/api/orders", orderRoutes);

// app.use('/api/admin', require('./routes/orders'));
app.use("/api/orders", require("./routes/orders"));

// const adminAuthRoutes = require("./routes/admin-auth");

// Create HTTP server for Socket.io

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    // origin: process.env.FRONTEND_URL || "http://localhost:4000",

    origin: "*", // Allow all origins for development

    methods: ["GET", "POST"],
  },
});

const { verifyToken } = require("./config/jwt");

// 🔐 Authenticate admin socket connection
// io.use((socket, next) => {
//   const token = socket.handshake.auth.token;
//   if (!token) return next(new Error("Unauthorized"));

//   try {
//     const decoded = verifyToken(token); // from jwt.js
//     socket.adminId = decoded.id;
//     next();
//   } catch (err) {
//     next(new Error("Invalid token"));
//   }
// });
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

  // Proceed regardless of token – allow public users too
  next();
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // ✅ JOIN USER ROOM

  socket.on("joinUserRoom", (userId) => {
    if (userId) {
      socket.join(userId);

      console.log(`Client joined user room: ${userId}`);
    }
  });

  // Join order room for tracking
  socket.on("joinOrderRoom", (orderId) => {
    socket.join(orderId);

    console.log(`Client joined order room: ${orderId}`);
  });

  // Driver location updates

  socket.on("updateDriverLocation", async ({ orderId, location }) => {
    try {
      // Update order with driver location
      await Order.findByIdAndUpdate(orderId, {
        "driver.location": location,
      });

      // Emit to all clients tracking this order
      io.to(orderId).emit("driverLocationUpdate", location);
    } catch (error) {
      console.error("Error updating driver location:", error);
    }
  });

  // Order status updates

  socket.on("orderStatusUpdate", (order) => {
    io.to(order._id.toString()).emit("orderUpdate", order); // by order ID
    io.to(order.user.toString()).emit("orderUpdate", order); // ✅ by user ID
  });

  // Notify admin of new order

  socket.on("newOrder", (order) => {
    // Notify all admins

    io.emit("newOrderNotification", order);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Make io available to routes

app.set("io", io);

// Email transporter

const transporter = nodemailer.createTransport({
  service: "Gmail",

  auth: {
    user: process.env.EMAIL_USER,

    pass: process.env.EMAIL_PASS,
  },

  tls: {
    rejectUnauthorized: false, // 👈 Accept self-signed certs
  },
});

// app.use(express.static(__dirname, {

//   setHeaders: (res, path) => {

//     if (path.endsWith('.html')) {

//       res.setHeader('Content-Type', 'text/html');

//     }

//   }

// }));

// ✅ 🔽 Payment configuration endpoint

app.get("/config", (req, res) => {
  res.json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,

    paypalClientId: process.env.PAYPAL_CLIENT_ID,

    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
  });
});

// Serve reset-password.html for path-based tokens

app.get("/reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "reset-password.html"));
});

// Serve static files/ HTML page r

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get("/admin", (_, res) => res.sendFile(path.join(__dirname, "admin.html")));

app.get("/payment", (_, res) =>
  res.sendFile(path.join(__dirname, "payment.html"))
);

// Stripe payment intent

app.post("/create-payment-intent", async (req, res) => {
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

// Configure PayPal environment

const paypalClient = new paypal.core.PayPalHttpClient(
  new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,

    process.env.PAYPAL_SECRET
  )
);

// PayPal routes

app.post("/create-paypal-order", async (req, res) => {
  const { amount } = req.body;

  try {
    const request = new paypal.orders.OrdersCreateRequest();

    request.requestBody({
      intent: "CAPTURE",

      purchase_units: [
        {
          amount: {
            currency_code: "SEK",

            value: amount.toString(),
          },
        },
      ],
    });

    const order = await paypalClient.execute(request);

    res.json({ orderID: order.result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/capture-paypal-order", async (req, res) => {
  const { orderID } = req.body;

  try {
    const request = new paypal.orders.OrdersCaptureRequest(orderID);

    request.requestBody({});

    const captureData = await paypalClient.execute(request);

    res.json(captureData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// order creation/ confirmation endpoint:
// Update the /api/orders/confirm-payment endpoint
app.post("/api/orders/confirm-payment", async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: "Completed",
        status: "Confirmed",
        paymentMethod: paymentMethod,
        $push: {
          statusHistory: {
            status: "Confirmed",
            note: `Payment successful via ${paymentMethod}`,
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder)
      return res.status(404).json({ error: "Order not found" });

    // ✅ Emit order to admin dashboard
    const io = req.app.get("io");
    io.emit("new-order", updatedOrder);

    // ✅ Send confirmation email
    if (updatedOrder.customer?.email) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const emailContent = `
      <div
        style="max-width: 600px; margin: auto; font-family: 'Segoe UI', sans-serif; color: #333; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <!-- LOGO -->
        <div style="background: #000; padding: 20px; text-align: center;">
          <img src="https://matkungen-campus.onrender.com/assets/images/logo.png" alt="Matkungen" style="height: 60px;"
            onerror="this.style.display='none';" />
          <h2 style="margin: 10px 0 0; color: #FFD700;">Matkungen</h2>
        </div>

        <!-- HEADER -->
        <div style="padding: 24px 32px; text-align: center; background: #000; color: #FFD700;">
          <h2 style="margin: 0;">Thank you for your order, ${
            updatedOrder.customer.name
          }!</h2>
          <p style="margin: 5px 0 0; font-size: 18px;">Order #${
            updatedOrder.orderNumber
          } is being prepared</p>
        </div>

        <!-- ORDER SUMMARY -->
        <div style="padding: 24px 32px;">
          <h3 style="color: #000000; margin-top: 0;">Order Summary:</h3>
          <ul style="padding-left: 20px; margin: 0 0 15px;">
            ${updatedOrder.items
              .map(
                (item) =>
                  `<li style="margin-bottom: 6px;">${item.name} × ${
                    item.quantity
                  } = ${(item.price * item.quantity).toFixed(2)} kr</li>`
              )
              .join("")}
          </ul>
          <p><strong>Subtotal:</strong> ${updatedOrder.subtotal.toFixed(
            2
          )} kr</p>
          <p><strong>Delivery Fee:</strong> ${updatedOrder.deliveryFee.toFixed(
            2
          )} kr</p>
          <p style="font-size: 18px;"><strong>Total:</strong> ${updatedOrder.total.toFixed(
            2
          )} kr</p>
          <p><strong>Payment Method:</strong> ${updatedOrder.paymentMethod}</p>
        </div>

        <!-- DELIVERY INFO -->
        <hr style="border: none; border-top: 1px solid #e0e0e0;" />
        <div style="padding: 24px 32px;">
          <h3 style="margin-top: 0;">Delivery Information</h3>
          <p><strong>Name:</strong> ${updatedOrder.customer.name}</p>
          <p><strong>Phone:</strong> ${updatedOrder.customer.phone}</p>
          <p><strong>Address:</strong> ${updatedOrder.customer.address}</p>
          ${
            updatedOrder.customer.notes
              ? `<p><strong>Notes:</strong> ${updatedOrder.customer.notes}</p>`
              : ""
          }
          <p><strong>Estimated Delivery:</strong> 25–40 minutes</p>
        </div>

        <!-- TRACK BUTTON -->
        <div style="text-align: center; padding: 20px;">
          <a href="http://localhost:4000/track-order.html?order=${
            updatedOrder.orderNumber
          }" target="_blank"
            style="display: inline-block; padding: 12px 24px; background-color: #FFD700; color: #000; font-weight: bold; text-decoration: none; border-radius: 6px;">
            Track Your Order
          </a>
        </div>

        <!-- FOOTER -->
        <div style="padding: 16px 32px; background: #f4f4f4; text-align: center; font-size: 14px; color: #777;">
          <p style="margin: 0;">📞 Need help? Call us at <strong>0769 666 666</strong></p>
          <p style="margin: 4px 0 0;">You’ll receive another update when your order is on the way.</p>
          <p style="margin: 4px 0 0;">Matkungen © ${new Date().getFullYear()}</p>
        </div>
      </div>
      `;

      const mailOptions = {
        from: `"Matkungen" <${process.env.EMAIL_USER}>`,
        to: updatedOrder.customer.email,
        subject: `Order #${updatedOrder.orderNumber} Confirmed - Matkungen`,
        html: emailContent,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log("📧 Email sent to", updatedOrder.customer.email);
      } catch (emailErr) {
        console.error("❌ Email sending failed:", emailErr);
      }
    }

    res.status(200).json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("❌ Payment confirmation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const token =
    req.header("x-auth-token") || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,

      error: "No token, authorization denied",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify admin role

    if (!decoded.role || !["admin", "superadmin"].includes(decoded.role)) {
      return res.status(403).json({
        success: false,

        error: "Admin privileges required",
      });
    }

    req.admin = decoded;

    next();
  } catch (err) {
    res.status(401).json({
      success: false,

      error: "Token is not valid",
    });
  }
};

// Admin-only routes

// In server.js, add this route before the server.listen()

app.get("/api/admin/orders/:id", adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update /api/admin/orders endpoint
app.get("/api/admin/orders", adminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 30 } = req.query;
    const query = {};

    // Fixed status handling
    if (status && status !== "all") {
      query.status = status;
    } else if (status === "all") {
      // Explicitly show all statuses
    }

    if (search) {
      query.$or = [
        { "customer.name": { $regex: search, $options: "i" } },
        { "customer.phone": { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    };

    const orders = await Order.paginate(query, options);
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update stats calculation to only count completed payments
app.get("/api/admin/stats", adminAuth, async (req, res) => {
  try {
    // Get current date boundaries in server's timezone
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Calculate stats - ONLY COUNT COMPLETED PAYMENTS
    const stats = {
      todayOrders: await Order.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
        paymentStatus: "Completed", // Only completed payments
      }),

      pendingOrders: await Order.countDocuments({
        status: "Pending",
        paymentStatus: "Completed", // Only completed payments
      }),

      // Revenue only from delivered orders with completed payments
      revenue:
        (
          await Order.aggregate([
            {
              $match: {
                status: "Delivered",
                paymentStatus: "Completed", // Only completed payments
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

// User Authentication Routes

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Create user

    const user = await User.create({ name, email, password });

    // Generate token

    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,

      token,

      user: {
        id: user._id,

        name: user.name,

        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token

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

app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate reset token

    const resetToken = user.getResetPasswordToken();

    await user.save();

    // Create reset URL

    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/reset-password/${resetToken}`;

    // Email message

    const message = `

  <h2>Password Reset Request</h2>

  <p>You requested a password reset for your <strong>Matkungen</strong> account.</p>

  <p>

    <a href="${resetUrl}" 

       style="display:inline-block; padding:10px 20px; background-color:#4CAF50; color:#ffffff; text-decoration:none; border-radius:5px;">

       Click here to reset your password

    </a>

  </p>

  <p>This link will expire in 10 minutes.</p>

`;

    // Send email

    await transporter.sendMail({
      to: user.email,

      subject: "Password Reset Request",

      html: message,
    });

    res.json({ success: true, message: "Password reset email sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const { password } = req.body;

    // Hash token

    const resetPasswordToken = crypto

      .createHash("sha256")

      .update(token)

      .toString("hex");

    // Find user

    const user = await User.findOne({
      resetPasswordToken,

      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    // Set new password

    user.password = password;

    user.resetPasswordToken = undefined;

    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// admin reset password route

app.get("/admin-reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-reset-password.html"));
});

// Start server

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
