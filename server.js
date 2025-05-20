require("dotenv").config();
const express = require("express");
const dotenv = require('dotenv');
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

// Routes
app.use("/api/auth", authRoutes);   // For register/login
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes); // For admin orders

// Create HTTP server for Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Socket.io connection handler
io.on("connection", socket => {
  console.log("New client connected");

  // Join order room for tracking
  socket.on("joinOrderRoom", orderId => {
    socket.join(orderId);
    console.log(`Client joined order room: ${orderId}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Make io available to routes
app.set("io", io);

// Email transporter
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false  // 👈 Accept self-signed certs
  }
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
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN
  });
});

// Serve reset-password.html for path-based tokens
app.get("/reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "reset-password.html"));
});

// Serve static files/ HTML page r
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin", (_, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/payment", (_, res) => res.sendFile(path.join(__dirname, "payment.html")));

// Stripe payment intent
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: "sek",
      payment_method_types: ["card"]
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
            value: amount.toString()
          }
        }
      ]
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

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const token = req.header('x-auth-token') || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // In a real app, you would check if the user has admin privileges
    req.admin = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token is not valid" });
  }
};

// Admin-only routes
app.get("/api/admin/stats", adminAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      totalOrders: await Order.countDocuments(),
      todayOrders: await Order.countDocuments({ createdAt: { $gte: today } }),
      pendingOrders: await Order.countDocuments({ status: "Pending" }),
      revenue: await Order.aggregate([
        { $match: { status: "Delivered" } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ])
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
        email: user.email
      }
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
        address: user.address
      }
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
const resetUrl = `${req.protocol}://${req.get("host")}/reset-password/${resetToken}`;


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
      html: message
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
      resetPasswordExpire: { $gt: Date.now() }
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

// // Order Routes
// app.post("/api/orders", async (req, res) => {
//   try {
//     const { user, items, customer, paymentMethod } = req.body;

//     // Calculate totals
//     const subtotal = items.reduce(
//       (sum, item) => sum + item.price * item.quantity,
//       0
//     );
//     const deliveryFee = 20;
//     const total = subtotal + deliveryFee;

//     // Generate order number
//     const orderNumber = `${Math.floor(100000 + Math.random() * 900000)}`;

//     // Create order
//     const order = await Order.create({
//       user: user ? user.id : null,
//       orderNumber,
//       items,
//       customer,
//       subtotal,
//       deliveryFee,
//       total,
//       paymentMethod,
//       paymentStatus:
//         paymentMethod === "Cash on Delivery" ? "Pending" : "Completed",
//       status: "Processing"
//     });

//     res.status(201).json({ success: true, order });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get("/api/orders/user/:userId", async (req, res) => {
//   try {
//     const orders = await Order.find({ user: req.params.userId })
//       .sort({ createdAt: -1 })
//       .limit(10);

//     res.json({ success: true, orders });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get("/api/orders/:orderNumber", async (req, res) => {
//   try {
//     const order = await Order.findOne({ orderNumber: req.params.orderNumber });
//     if (!order) {
//       return res.status(404).json({ error: "Order not found" });
//     }
//     res.json({ success: true, order });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
