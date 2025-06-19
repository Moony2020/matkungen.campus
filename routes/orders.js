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

// ✅ Generate a unique 6-digit order number

async function generateUniqueOrderNumber() {
  let isUnique = false;

  let orderNumber;

  while (!isUnique) {
    orderNumber = `${Math.floor(100000 + Math.random() * 900000)}`;

    const existing = await Order.findOne({ orderNumber });

    if (!existing) isUnique = true;
  }

  return orderNumber;
}

// ✅ Get orders for the current logged-in user
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

// ✅ Get orders for a specific userId (flexible use)
router.get("/user/:userId", optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Only fetch orders with completed payment
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
// ✅ Update order status
router.put("/:orderId/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Prevent unnecessary updates
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
      note: `Status changed to ${status} by admin`,
    });

    const updatedOrder = await order.save();

    // Emit update to specific user (customer)
    req.app
      .get("io")
      .to(order.user?.toString())
      .emit("orderUpdate", updatedOrder);

    // Emit to all admins if status is Delivered
    if (status === "Delivered") {
      const io = req.app.get("io");
      io.emit("order-delivered", updatedOrder);
    }

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get all orders (admin only)
async function updateOrderAfterPayment(orderId, paymentDetails) {
  try {
    const order = await Order.findByIdAndUpdate(
      orderId,

      {
        paymentStatus: "Completed",

        status: "Confirmed",

        $push: {
          statusHistory: {
            status: "Confirmed",

            note: `Payment completed via ${paymentDetails.method} (${paymentDetails.id})`,
          },
        },
      },

      { new: true }
    ).lean();

    if (!order) {
      throw new Error("Order not found");
    }

    // Get the io instance from app
    const io = require("../server").io;

    // Notify all admins
    io.emit("orderUpdate", order);

    // Notify specific user if logged in

    if (order.user) {
      io.to(order.user.toString()).emit("orderUpdate", order);
    }

    return order;
  } catch (error) {
    console.error("Failed to update order after payment:", error);

    throw error;
  }
}

// Then make it available to routes
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

// ✅ Create a new order (updated to handle payment status)
router.post("/", optionalAuth, async (req, res) => {
  const { items, customer, paymentMethod, subtotal, deliveryFee, total } =
    req.body;

  try {
    const orderNumber = await generateUniqueOrderNumber();

    // Set status based on payment method
    const paymentStatus =
      paymentMethod === "Cash on Delivery" ? "Pending" : "Completed";

    const status = "Confirmed"; // All orders start as confirmed

    const order = new Order({
      user: req.user || null,
      orderNumber,
      items,
      customer,
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentStatus,
      status,
      statusHistory: [
        {
          status: status,
          note: `Order created with ${paymentMethod} payment`,
        },
      ],
    });

    const savedOrder = await order.save();

    // Get the io instance and emit new-order event
    const io = req.app.get("io");
    io.emit("new-order", savedOrder);

    res.status(201).json({ success: true, order: savedOrder });
  } catch (err) {
    console.error("Order creation error:", err);
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

// track order by orderNumber
router.get("/track/:orderNumber", async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order)
      return res.status(404).json({ success: false, error: "Order not found" });

    // After
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

// ✅ Update order by orderNumber
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

// ✅ Delete an order by orderNumber
router.delete("/:orderNumber", auth, async (req, res) => {
  try {
    const result = await Order.findOneAndDelete({
      orderNumber: req.params.orderNumber,

      user: req.user,
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

// ✅ Delete an order by orderNumber
router.delete("/:orderNumber", auth, async (req, res) => {
  try {
    const result = await Order.findOneAndDelete({
      orderNumber: req.params.orderNumber,
      user: req.user,
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

router.post("/:id/complete", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // update order status and payment method
    order.paymentMethod = req.body.paymentMethod;
    order.paymentStatus = "Completed";
    order.status = "Confirmed";

    order.statusHistory.push({
      status: "Confirmed",
      note: `Payment completed via ${req.body.paymentMethod}`,
    });

    const updatedOrder = await order.save();

    // send notification just after payment success
    req.app.get("io").emit("new-order", updatedOrder);

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
