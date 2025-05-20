const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { verifyToken } = require("../config/jwt");

// ✅ Middleware to verify admin (simple auth check)
const adminAuth = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = verifyToken(token);
    req.adminId = decoded.id; // في المستقبل ممكن تتحقق هل المستخدم هو أدمن
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// ✅ Get all orders (for admin)
router.get("/orders", adminAuth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// ✅ Update order status
router.put("/orders/:orderNumber/status", adminAuth, async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status } = req.body;

    const order = await Order.findOne({ orderNumber });
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.status = status;
    order.statusHistory.push({ status, changedAt: new Date() });
    await order.save();

    // 🔄 Optional: Emit socket.io update to client
    const io = req.app.get("io");
    io.to(order._id.toString()).emit("orderUpdate", order);

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order status" });
  }
});

module.exports = router;
