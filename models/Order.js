const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  img: { type: String },
  status: {
    type: String,
    enum: [
      "Pending",
      "Confirmed",
      "Preparing",
      "On the Way",
      "Delivered",
      "Cancelled"
    ],
    default: "Pending"
  },
  statusHistory: [
    {
      status: { type: String, required: true },
      changedAt: { type: Date, default: Date.now },
      note: String
    }
  ],
  estimatedDeliveryTime: Date,
  driver: {
    name: String,
    phone: String,
    location: String // Could be coordinates for live tracking
  }
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  orderNumber: { type: String, required: true, unique: true },
  items: [orderItemSchema],
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    notes: { type: String }
  },
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true, default: 20 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  paymentStatus: { type: String, default: "Pending" },
  status: { type: String, default: "Processing" },
  createdAt: { type: Date, default: Date.now }
});

// In models/Order.js
orderSchema.pre("save", function(next) {
  if (this.isModified("status") && this.status === "On the Way") {
    // Set estimated delivery time (current time + 30-45 minutes)
    const deliveryTime = new Date();
    deliveryTime.setMinutes(
      deliveryTime.getMinutes() + 30 + Math.floor(Math.random() * 15)
    );
    this.estimatedDeliveryTime = deliveryTime;
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
