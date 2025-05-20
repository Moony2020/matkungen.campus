const express = require("express");
const Order = require("../models/Order");
const { verifyToken } = require("../config/jwt");

const router = express.Router();

// ✅ Optional authentication middleware
const optionalAuth = (req, res, next) => {
  let token = req.header("x-auth-token");

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded.id;
    } catch (err) {
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
};

// 🔐 Strict authentication middleware
const auth = (req, res, next) => {
  let token = req.header("x-auth-token");

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid" });
  }
};

// ✅ Get orders for the current logged-in user
router.get("/user", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user }).sort({ createdAt: -1 }).limit(10);
    res.json({ success: true, orders });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get orders for a specific userId (flexible use)
router.get("/user/:userId", optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });

    res.json({ success: true, orders }); // Always return 200, even if empty
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// route for status updates
// Update order status
router.put('/:orderId/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { 
        status,
        $push: { 
          statusHistory: { 
            status,
            note: `Status changed to ${status} by admin`
          } 
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Emit real-time update
    req.app.get('io').to(order._id.toString()).emit('orderUpdate', order);
    
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

async function notifyUser(order, status) {
  // Implementation would send email or push notification
}

// ✅ Create a new order
router.post("/", optionalAuth, async (req, res) => {
  const { items, customer, paymentMethod } = req.body;

  try {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = 20;
    const total = subtotal + deliveryFee;
    const orderNumber = `${Math.floor(100000 + Math.random() * 900000)}`;

   const order = new Order({
      user: req.user || null,
      orderNumber,
      items,
      customer,
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentStatus: paymentMethod === "Cash on Delivery" ? "Pending" : "Paid",
      status: paymentMethod === "Cash on Delivery" ? "Pending Payment" : "Confirmed",
      statusHistory: [{
        status: paymentMethod === "Cash on Delivery" ? "Pending Payment" : "Confirmed",
        note: "Order created"
      }]
    });

   await order.save();
    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get a single order by ID (logged-in user only)
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user });

    if (!order) {
      return res.status(404).json({ msg: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("Error getting order by ID:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Update order by orderNumber (used after payment or admin action)
router.put("/:orderNumber", optionalAuth, async (req, res) => {
  try {
    const updatedOrder = await Order.findOneAndUpdate(
      { orderNumber: req.params.orderNumber },
      { $set: req.body },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ order: updatedOrder });
  } catch (err) {
    console.error("Error updating order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Delete an order by orderNumber (if needed)
router.delete("/:orderNumber", auth, async (req, res) => {
  try {
    const result = await Order.findOneAndDelete({
      orderNumber: req.params.orderNumber,
      user: req.user
    });

    if (!result) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ success: true, message: "Order deleted" });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
