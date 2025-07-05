const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Admin = require("../models/Admin");
const Order = require("../models/Order");
const User = require("../models/User");

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, //
  },
});

// Admin authentication middleware

const adminAuth = (req, res, next) => {
  const token =
    req.header("x-auth-token") || req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token is not valid" });
  }
};

// Admin login
router.post("/login", async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    console.log("🔐 Login attempt for:", email);

    if (!email || !password) {
      return res.status(400).json({
        error: "Please enter both email and password",
      });
    }

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });

    if (!admin) {
      return res.status(401).json({
        error: "Incorrect email or password.",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        error: "Incorrect email or password.",
      });
    }

    // Set expiration based on remember me choice
    const expiresIn = remember ? "30d" : "1d";
    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      error: "Something went wrong. Please try again later.",
    });
  }
});

// Forgot password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) return res.status(404).json({ error: "Admin not found" });

    const resetToken = crypto.randomBytes(20).toString("hex");

    admin.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    admin.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await admin.save();

    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/admin-reset-password/${resetToken}`;

    const message = `

      <h2>Password Reset Request</h2>

      <p>You requested a password reset for your Matkungen admin account.</p>

      <p><a href="${resetUrl}">Reset Password</a></p>

      <p>This link will expire in 10 minutes.</p>

    `;

    await transporter.sendMail({
      to: admin.email,

      subject: "Admin Password Reset Request",

      html: message,
    });

    res.json({ success: true, message: "Password reset email sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password

router.put("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const admin = await Admin.findOne({
      resetPasswordToken,

      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!admin)
      return res.status(400).json({ error: "Invalid or expired token" });

    admin.password = password;

    admin.resetPasswordToken = undefined;

    admin.resetPasswordExpire = undefined;

    await admin.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Verify token

router.get("/verify", adminAuth, (req, res) => {
  res.json({ adminId: req.adminId });
});

// ✅ Dashboard stats
router.get("/stats", adminAuth, async (req, res) => {
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

    // Calculate stats - include ALL delivered orders from today regardless of when they were marked delivered
    const stats = {
      todayOrders: await Order.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd },
        paymentStatus: "Completed",
      }),
      pendingOrders: await Order.countDocuments({
        status: "Pending",
        paymentStatus: "Completed",
      }),
      // Revenue only from delivered orders with completed payments
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

// Recent orders (for dashboard) - now filtered by today// All today's orders
router.get("/orders/recent", adminAuth, async (req, res) => {
  try {
    // Get current date boundaries
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Check if we want all orders
    const all = req.query.all === "true";

    // Show all completed orders from TODAY
    const orders = await Order.find({
      createdAt: { $gte: todayStart, $lt: todayEnd },
      paymentStatus: "Completed",
    })
      .sort({ createdAt: -1 }) // Newest first
      .limit(all ? 0 : 5) // 0 = no limit
      .lean();

    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single order by ID for Admin
router.get("/admin/orders/:id", adminAuth, async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.id });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("Error fetching order:", err);

    res.status(500).json({ error: "Server error" });
  }
});

// order details route

router.get("/orders/:id", adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!order) {
      return res.status(404).json({
        success: false,

        error: "Order not found",
      });
    }

    res.json({
      success: true,

      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      error: error.message,
    });
  }
});

// get all orders
router.get("/orders", adminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 30, period } = req.query;
    const query = { paymentStatus: "Completed" }; // Always filter completed payments

    // ===== 1. TIME PERIOD FILTER =====
    if (period === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: todayStart };
    } else if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query.createdAt = { $gte: weekAgo };
    }
    // No "else" needed → "all time" shows everything

    // ===== 2. STATUS FILTER =====
    if (status && status !== "all") {
      query.status = status; // Only filter if not "all"
    }

    // ===== 3. SEARCH FUNCTIONALITY =====
    if (search) {
      query.$or = [
        { "customer.name": { $regex: search, $options: "i" } },
        { "customer.phone": { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
      ];
    }

    // ===== 4. PAGINATION =====
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }, // Newest first
      populate: "user", // Include user data if needed
    };

    const orders = await Order.paginate(query, options);
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ Update order status with real-time notifications and stats updates
router.put("/orders/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = [
      "Pending",
      "Confirmed",
      "On the Way",
      "Delivered",
      "Cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // Skip if status unchanged
    if (order.status === status) {
      return res.json({
        success: true,
        order,
        message: "Status unchanged",
      });
    }

    // Update status and history
    order.status = status;
    order.statusHistory.push({
      status,
      changedAt: new Date(),
      note: `Status updated by admin to ${status}`,
    });

    // Special handling for specific statuses
    if (status === "On the Way") {
      order.estimatedDeliveryTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    }

    // Save the updated order
    const updatedOrder = await order.save();

    // Get current date boundaries
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    let stats = null;
    if (
      status === "Delivered" &&
      order.paymentStatus === "Completed" &&
      order.createdAt >= todayStart &&
      order.createdAt < todayEnd
    ) {
      // Calculate fresh stats - include ALL delivered orders from today
      stats = {
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
      req.app.get("io").emit("stats-update", stats);
    }

    // Emit order update to all clients
    req.app
      .get("io")
      .to(order._id.toString())
      .emit("orderUpdate", updatedOrder);
    req.app
      .get("io")
      .to(order.user?.toString())
      .emit("orderUpdate", updatedOrder);

    res.json({
      success: true,
      order: updatedOrder,
      stats, // Include stats only when relevant
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// DELETE /api/admin/orders/delete-all
router.delete("/orders/delete-all", adminAuth, async (req, res) => {
  try {
    await Order.deleteMany({});
    res.status(200).json({ message: "All orders deleted successfully." });
  } catch (error) {
    console.error("Error deleting orders:", error);
    res.status(500).json({ message: "Failed to delete orders." });
  }
});

module.exports = router;
