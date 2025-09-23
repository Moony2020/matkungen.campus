// routes/orders.js
const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const crypto = require("crypto");
const { verifyToken } = require("../config/jwt");
const router = express.Router();

// ---------------- Auth helpers ----------------
const optionalAuth = (req, res, next) => {
  let token = req.header("x-auth-token");
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded.id;
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
};

const auth = (req, res, next) => {
  let token = req.header("x-auth-token");
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token)
    return res.status(401).json({ msg: "No token, authorization denied" });

  try {
    const decoded = verifyToken(token);
    req.user = decoded.id;
    next();
  } catch {
    res.status(401).json({ msg: "Token is not valid" });
  }
};

// ---------------- Utilities ----------------
async function generateUniqueOrderNumber() {
  let orderNumber, existing;
  do {
    orderNumber = `${Math.floor(100000 + Math.random() * 900000)}`;
    existing = await Order.findOne({ orderNumber });
  } while (existing);
  return orderNumber;
}

// ---------------- Routes ----------------

// Get latest orders for current user
router.get("/user", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, orders });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get orders for a specific user (completed payments only)
router.get("/user/:userId", optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await Order.find({
      user: userId,
      paymentStatus: "Completed",
    }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update order status (admin UX + customer socket updates)
router.put("/:orderId/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Missing status" });

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === status) {
      return res.json({ success: true, order, message: "Status unchanged" });
    }

    order.status = status;
    order.statusHistory.push({
      status,
      changedAt: new Date(),
      note: `Status changed to ${status}`,
    });

    const updatedOrder = await order.save();

    // notify customer room + admins
    const io = req.app.get("io");
    if (order.user)
      io.to(order.user.toString()).emit("orderUpdate", updatedOrder);
    io.emit("order-status-changed", updatedOrder);

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----- Payment update helper (webhooks/checkout) -----
async function updateOrderAfterPayment(orderId, paymentDetails = {}) {
  try {
    const method = paymentDetails.method || "Online";
    const pid = paymentDetails.id || "-";

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: "Completed",
        status: "Confirmed",
        $push: {
          statusHistory: {
            status: "Confirmed",
            note: `Payment completed via ${method} (${pid})`,
            changedAt: new Date(),
          },
        },
      },
      { new: true }
    ).lean();

    if (!order) throw new Error("Order not found");

    // sockets for admin/user dashboards
    const { io, app } = require("../server");
    io.emit("orderUpdate", order);
    if (order.user) io.to(order.user.toString()).emit("orderUpdate", order);

    // trigger centralized email in server.js
    app.emit("order:paid", order);

    return order;
  } catch (error) {
    console.error("Failed to update order after payment:", error);
    throw error;
  }
}

// Complete payment (generic)
router.post("/:id/complete-payment", async (req, res) => {
  try {
    const order = await updateOrderAfterPayment(
      req.params.id,
      req.body.paymentDetails
    );
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new order
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { items, customer, paymentMethod, subtotal, deliveryFee, total } =
      req.body;

    // Normalize customer fields from any shape the client might send
    const rawCustomer = customer || {};
    let normalizedEmail = String(
      (req.user && req.user.email) || // will be falsy because req.user is an id (fine)
        req.body.email ||
        rawCustomer.email ||
        req.body.contactEmail ||
        req.body.billingEmail ||
        ""
    )
      .trim()
      .toLowerCase();

    console.log("orders POST → normalizedEmail:", normalizedEmail);
    const name = (rawCustomer.name || req.body.name || "Guest").trim();
    const phone = (rawCustomer.phone || req.body.phone || "").trim();
    const address = rawCustomer.address || req.body.address || "";

    // Require email for guest checkout (logged-in users can skip this)
    if (!req.user && !normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: "Email is required to place an order.",
      });
    }

    // Ensure we always have a User (guest or logged-in)
    let userId;
    if (req.user) {
      userId = req.user;
    } else {
      // Guest: find-or-create lightweight user by email
      let user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        const randomPassword = crypto.randomBytes(16).toString("hex");
        user = await User.create({
          name,
          email: normalizedEmail, // <-- IMPORTANT
          phone,
          address,
          isGuest: true,
          password: randomPassword, // hashed by your pre-save hook
        });
      } else if (user.isGuest) {
        // Optionally enrich guest profile
        const updates = {};
        if (!user.name && name) updates.name = name;
        if (!user.phone && phone) updates.phone = phone;
        if (Object.keys(updates).length) {
          await User.updateOne({ _id: user._id }, { $set: updates });
        }
      }
      userId = user._id;
    }
    // Persist latest contact info on the user so Customers page shows it / registered users-customers
    if (userId) {
      // decide if the current order is pickup
      const isPickup =
        /pickup/i.test(String(req.body.fulfillmentMethod || "")) ||
        /avh[aä]mtning/i.test(String(address || ""));

      const set = {};
      if (name) set.name = name; // optional, keep name in sync
      if (phone) set.phone = phone; // always update latest phone

      // Only save address when it's a real delivery address
      if (!isPickup && address && !/avh[aä]mtning/i.test(address)) {
        set.address = address;
      }

      if (Object.keys(set).length) {
        await User.updateOne({ _id: userId }, { $set: set });
      }
    }

    const orderNumber = await generateUniqueOrderNumber();
    const paymentStatus =
      paymentMethod === "Cash on Delivery" ? "Pending" : "Completed";
    const status = "Confirmed";

    const order = new Order({
      user: userId,
      orderNumber,
      items,
      // keep embedded customer too (used by your email sender)
      customer: {
        name,
        email: normalizedEmail, // <-- IMPORTANT
        phone,
        address,
      },
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentStatus,
      status,
      statusHistory: [
        {
          status,
          note: `Order created with ${paymentMethod} payment`,
          changedAt: new Date(),
        },
      ],
    });

    const savedOrder = await order.save();
    console.log(
      "orders POST → savedOrder.customer.email:",
      savedOrder?.customer?.email
    );
    // sockets
    const io = req.app.get("io");
    io.emit("new-order", savedOrder);

    // centralized email (server.js listeners)
    req.app.emit("order:created", savedOrder);

    res.status(201).json({ success: true, order: savedOrder });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get a single order by Mongo _id (belongs to the logged-in user)
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user });
    if (!order) return res.status(404).json({ msg: "Order not found" });
    res.json(order);
  } catch (err) {
    console.error("Error getting order by ID:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Public tracking by orderNumber
router.get("/track/:orderNumber", async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order)
      return res.status(404).json({ success: false, error: "Order not found" });

    res.json({
      success: true,
      order: {
        _id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update an order by orderNumber
router.put("/:orderNumber", optionalAuth, async (req, res) => {
  try {
    const updatedOrder = await Order.findOneAndUpdate(
      { orderNumber: req.params.orderNumber },
      { $set: req.body },
      { new: true }
    );
    if (!updatedOrder)
      return res.status(404).json({ error: "Order not found" });
    res.json({ order: updatedOrder });
  } catch (err) {
    console.error("Error updating order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete order by orderNumber (must belong to logged-in user)
router.delete("/:orderNumber", auth, async (req, res) => {
  try {
    const result = await Order.findOneAndDelete({
      orderNumber: req.params.orderNumber,
      user: req.user,
    });
    if (!result) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true, message: "Order deleted" });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Mark order complete (manual/admin path with auth)
router.post("/:id/complete", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.paymentMethod = req.body.paymentMethod;
    order.paymentStatus = "Completed";
    order.status = "Confirmed";
    order.statusHistory.push({
      status: "Confirmed",
      note: `Payment completed via ${req.body.paymentMethod}`,
      changedAt: new Date(),
    });

    const updatedOrder = await order.save();

    // sockets
    req.app.get("io").emit("new-order", updatedOrder);

    // centralized email
    req.app.emit("order:paid", updatedOrder);

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("Complete order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
