// routes/admin.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Admin = require("../models/Admin");
const Order = require("../models/Order");
const User = require("../models/User");

const adminAuth = require("../middleware/adminAuth");
const { isValidObjectId } = require("mongoose");

// Reusable validator for any :id style param
function validateObjectIdParam(paramName) {
  return (req, res, next) => {
    const val = req.params[paramName];
    if (!isValidObjectId(val)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid id format" });
    }
    next();
  };
}
// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  tls: { rejectUnauthorized: false },
});

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

    // 🔴 Set cookie BEFORE sending JSON
    res.cookie("admin_token", token, {
      httpOnly: true,
      sameSite: "lax",
      // same-origin (localhost:4000 & prod domain)
      secure: process.env.NODE_ENV === "production", // false on localhost, true on HTTPS prod
      maxAge: (remember ? 30 : 1) * 24 * 60 * 60 * 1000,
    });
    // Set cookie to sameSite: "none" and secure: true: if admin UI runs on a different domain / port than the API
    //     res.cookie("admin_token", token, {
    //   httpOnly: true,
    //   sameSite: "none",
    //   secure: true,
    //   maxAge: ...
    // });

    // ✅ Now send the response (and return)
    return res.json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      // optional: you can omit `token` now since cookie is used
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      error: "Something went wrong. Please try again later.",
    });
  }
});

// (optional) Admin logout: clear cookie
router.post("/logout", (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ success: true });
});

// Forgot password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
    // 200 on unknown email to avoid enumeration (or keep 404 if you prefer)
    if (!admin)
      return res.json({
        success: true,
        message: "If the email exists, a link was sent.",
      });

    const resetToken = admin.getResetPasswordToken();
    await admin.save({ validateBeforeSave: false });

    const resetUrl = `${req.protocol}://${req.get(
      "host"
    )}/admin-reset-password/${resetToken}`;
    const html = `
      <h2>Admin Password Reset</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Admin Password</a></p>
      <p>This link expires in 10 minutes.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: admin.email,
      subject: "Admin Password Reset",
      html,
    });

    return res.json({
      success: true,
      message: "Reset link sent if the email exists.",
    });
  } catch (err) {
    console.error("Admin forgot password error:", err);
    return res.status(500).json({ error: "Email sending failed" });
  }
});

// --- RESET PASSWORD (ADMIN) ---
router.put("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6)
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const admin = await Admin.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!admin)
      return res.status(400).json({ error: "Invalid or expired token" });

    admin.password = password; // ✅ hook will hash
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;
    await admin.save();

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("Admin reset password error:", err);
    return res.status(500).json({ error: "Could not reset password" });
  }
});

// --------------- PROTECTED routes start here ---------------
router.use(adminAuth);

// ✅ Top menu items (best sellers) for week/month
router.get("/top-items", async (req, res) => {
  try {
    const period = (req.query.period || "week").toLowerCase(); // "week" | "month"
    const limit = Math.min(parseInt(req.query.limit || "5", 10), 20);

    const now = new Date();
    let startDate;

    if (period === "month") {
      // last 30 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
    } else {
      // default: last 7 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    }

    // Count only completed/paid orders; include Delivered first if you prefer:
    // match: { status: "Delivered", paymentStatus: "Completed", createdAt: { $gte: startDate } }
    const top = await Order.aggregate([
      {
        $match: {
          paymentStatus: "Completed",
          createdAt: { $gte: startDate },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          qty: { $sum: { $toInt: "$items.quantity" } },
          revenue: {
            $sum: {
              $multiply: [
                { $toDouble: { $ifNull: ["$items.price", 0] } },
                { $toInt: { $ifNull: ["$items.quantity", 0] } },
              ],
            },
          },
        },
      },
      { $sort: { qty: -1, revenue: -1 } },
      { $limit: limit },
      {
        $project: {
          name: "$_id",
          qty: 1,
          revenue: { $round: ["$revenue", 2] },
          _id: 0,
        },
      },
    ]);

    res.json({ success: true, period, items: top });
  } catch (err) {
    console.error("Top items error:", err);
    res.status(500).json({ success: false, error: "Failed to load top items" });
  }
});

// ✅ Verify (for frontend to check session)
router.get("/verify", (req, res) => {
  // adminAuth put the payload on req.admin
  return res.json({ success: true, admin: req.admin });
});

// ✅ Dashboard stats
router.get("/stats", async (req, res) => {
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

// Recent orders (for dashboard) - now filtered by today// All today's orders
router.get("/orders/recent", async (req, res) => {
  try {
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

// ✅ Get order status counts for chart
router.get("/orders/status-counts", async (req, res) => {
  try {
    const { period } = req.query;
    let startDate;
    const now = new Date();

    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "month") {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate = new Date(0); // All time
    }

    const statusCounts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          paymentStatus: "Completed",
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Format the result
    const result = {};
    statusCounts.forEach((item) => {
      result[item._id] = item.count;
    });

    res.json({ success: true, statusCounts: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get revenue data for charts (Revenue Analytics) (week, month, year)
router.get("/revenue", async (req, res) => {
  try {
    const { period } = req.query;
    console.log("Revenue request for period:", period);
    let startDate = new Date();

    // Set start date based on period
    if (period === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "month") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === "year") {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      return res.status(400).json({ error: "Invalid period" });
    }

    // Aggregate revenue data
    const revenueData = await Order.aggregate([
      {
        $match: {
          status: "Delivered",
          paymentStatus: "Completed",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            // Group by day, week, or month based on period
            ...(period === "week" && {
              day: { $dayOfWeek: "$createdAt" },
            }),
            ...(period === "month" && {
              day: { $dayOfMonth: "$createdAt" },
            }),
            ...(period === "year" && {
              month: { $month: "$createdAt" },
            }),
          },
          revenue: { $sum: "$total" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Format the response based on period
    let formattedData = [];
    if (period === "week") {
      // Create an array for each day of the week
      formattedData = Array(7).fill(0);
      revenueData.forEach((item) => {
        // MongoDB dayOfWeek: 1 (Sunday) to 7 (Saturday)
        // Adjust to our labels: 0 (Monday) to 6 (Sunday)
        const dayIndex = (item._id.day + 5) % 7;
        formattedData[dayIndex] = item.revenue;
      });
    } else if (period === "month") {
      // Create an array for each day of the month
      const now = new Date();
      const daysInMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).getDate();
      formattedData = Array(daysInMonth).fill(0);
      revenueData.forEach((item) => {
        formattedData[item._id.day - 1] = item.revenue;
      });
    } else if (period === "year") {
      // Create an array for each month of the year
      formattedData = Array(12).fill(0);
      revenueData.forEach((item) => {
        formattedData[item._id.month - 1] = item.revenue;
      });
    }

    res.json({ success: true, revenueData: formattedData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single order by ID for Admin
router.get("/orders/by-number/:orderNumber", async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// order details route
// order details route (admin)
router.get(
  "/orders/:id",
  adminAuth,                    // protect admin endpoint
  validateObjectIdParam("id"),  // <- guard against non-ObjectId like "segmented"
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id)
        .populate("user", "name email");

      if (!order) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      res.json({ success: true, order });
    } catch (error) {
      console.error("Order detail error:", error);
      res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

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

    // After updating the order status, emit to the admin room
    req.app.get("io").to("admin").emit("chart-update", {
      orderId: order._id,
      newStatus: status,
    });

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
// Only super admins should be able to do this (optional but recommended)
const requireSuper = async (req, res, next) => {
  try {
    const adminId = req.admin?.id || req.adminId; // support either
    const admin = await Admin.findById(adminId).lean();
    if (!admin || (admin.role && admin.role.toLowerCase() !== "super")) {
      return res.status(403).json({ error: "Super admin only" });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: "Auth check failed" });
  }
};

// delete all orders
router.post("/orders/delete-all", adminAuth, requireSuper, async (req, res) => {
  try {
    const REQUIRED = process.env.DELETE_ALL_PHRASE || "DELETE ALL ORDERS"; // set a secret in env
    const { phrase } = req.body || {};

    // compare case-sensitive after trimming (change toUpperCase if you prefer case-insensitive)
    if ((phrase || "").trim() !== REQUIRED.trim()) {
      return res.status(400).json({ error: "Confirmation phrase mismatch" });
    }

    const result = await Order.deleteMany({});
    res.json({ ok: true, deleted: result.deletedCount || 0 });
  } catch (e) {
    console.error("Delete-all error:", e);
    res.status(500).json({ error: "Failed to delete orders" });
  }
});

// ========= CUSTOMERS API =========

// GET /api/admin/customers
// Query params:
//  - search: string (name/email/phone)
//  - filter: 'all' | 'yes' | 'no' (has orders?)
//  - sort: 'recent' | 'orders' | 'spent' | 'new'
//  - page: number (1-based)
//  - limit: number
router.get("/customers", adminAuth, async (req, res) => {
  try {
    const {
      search = "",
      filter = "all",
      sort = "recent",
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    // Build search match
    const userMatch = {};
    if (search.trim()) {
      // use $text when possible, or fallback to regex (both supported by our indexes)
      userMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Aggregate from User, lookup Orders, compute stats
    const pipeline = [
      { $match: userMatch },

      {
        $lookup: {
          from: "orders",
          let: { uid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$user", "$$uid"] },
                paymentStatus: "Completed",
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$user",
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: "$total" },
                lastOrderAt: { $first: "$createdAt" },
                lastOrderId: { $first: "$_id" },
                lastStatus: { $first: "$status" },
              },
            },
          ],
          as: "stats",
        },
      },
      {
        $addFields: {
          totalOrders: {
            $ifNull: [{ $arrayElemAt: ["$stats.totalOrders", 0] }, 0],
          },
          totalSpent: {
            $ifNull: [{ $arrayElemAt: ["$stats.totalSpent", 0] }, 0],
          },
          lastOrderAt: { $arrayElemAt: ["$stats.lastOrderAt", 0] },
          lastOrderId: { $arrayElemAt: ["$stats.lastOrderId", 0] },
          lastStatus: { $arrayElemAt: ["$stats.lastStatus", 0] },
        },
      },
    ];

    // Filter yes/no orders
    if (filter === "yes") {
      pipeline.push({ $match: { totalOrders: { $gt: 0 } } });
    } else if (filter === "no") {
      pipeline.push({ $match: { totalOrders: { $eq: 0 } } });
    }

    // Sorting
    const sortStage = (() => {
      switch (sort) {
        case "orders":
          return { totalOrders: -1, createdAt: -1 };
        case "spent":
          return { totalSpent: -1, createdAt: -1 };
        case "new":
          return { createdAt: -1 };
        case "recent":
        default:
          // recent activity: lastOrderAt first, then createdAt
          return { lastOrderAt: -1, createdAt: -1 };
      }
    })();
    pipeline.push({ $sort: sortStage });

    // Facet for pagination + total count
    pipeline.push({
      $facet: {
        data: [{ $skip: (pageNum - 1) * pageSize }, { $limit: pageSize }],
        total: [{ $count: "count" }],
      },
    });

    const result = await User.aggregate(pipeline);
    const rows = result[0]?.data || [];
    const total = result[0]?.total?.[0]?.count || 0;

    res.json({
      success: true,
      data: rows.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || "",
        createdAt: u.createdAt,
        isGuest: !!u.isGuest,
        totalOrders: u.totalOrders || 0,
        totalSpent: Math.round((u.totalSpent || 0) * 100) / 100,
        lastOrderAt: u.lastOrderAt || null,
        lastOrderId: u.lastOrderId || null,
        lastStatus: u.lastStatus || null,
      })),
      page: pageNum,
      limit: pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    console.error("Customers list error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

//✅ Get separate lists of Registered and Guest customers (must be placed BEFORE /customers/:id)
router.get("/customers/segmented", adminAuth, async (req, res) => {
  try {
    const registered = await User.find({ isGuest: { $ne: true } })
      .select("name email phone address createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const guests = await User.aggregate([
      { $match: { isGuest: true } },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "user",
          as: "orders",
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          phone: 1,
          totalOrders: { $size: "$orders" },
          lastOrderDate: { $max: "$orders.createdAt" },
        },
      },
      { $sort: { lastOrderDate: -1 } },
    ]);

    res.json({ success: true, registered, guests });
  } catch (err) {
    console.error("Error fetching segmented customers:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// GET /api/admin/customers/:id
// Must be *after* /customers/segmented
router.get(
  "/customers/:id",
  adminAuth,
  validateObjectIdParam("id"), // <-- add this
  async (req, res) => {
    try {
      const id = req.params.id;

      const customer = await User.findById(id).lean();
      if (!customer) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      const orders = await Order.find({
        user: customer._id,
        paymentStatus: "Completed",
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean();

      const totalOrders = await Order.countDocuments({
        user: customer._id,
        paymentStatus: "Completed",
      });

      const totalSpentAgg = await Order.aggregate([
        { $match: { user: customer._id, paymentStatus: "Completed" } },
        { $group: { _id: customer._id, total: { $sum: "$total" } } },
      ]);

      const totalSpent = totalSpentAgg[0]?.total || 0;

      res.json({
        success: true,
        customer: {
          _id: customer._id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || "",
          address: customer.address || "",
          createdAt: customer.createdAt,
          totalOrders,
          totalSpent: Math.round(totalSpent * 100) / 100,
        },
        orders,
      });
    } catch (error) {
      console.error("Customer detail error:", error);
      res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

// (Optional) GET /api/admin/customers/stats/today
router.get("/customers/stats/today", adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const count = await User.countDocuments({
      createdAt: { $gte: start, $lt: end },
    });
    res.json({ success: true, newCustomers: count });
  } catch (e) {
    console.error("Customers today stats error:", e);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
