// models/Order.js
const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

/* ---------- Subdocuments ---------- */
const orderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    img: { type: String },
    // per-item note coming from the modifier modal (optional)
    note: { type: String, default: "" },
  },
  { _id: false }
);

/* ---------- Main Order schema ---------- */
const orderSchema = new mongoose.Schema(
  {
    // Link to registered or guest user (may be null for very old guest orders)
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Public-facing short code, unique
    orderNumber: { type: String, required: true, unique: true },

    // Legacy compatibility (safe to keep; unused if you don’t create a Customer model)
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },

    items: [orderItemSchema],

    // Top-level checkout note (e.g., “Ring på dörren”)
    orderNote: { type: String, default: "" },

    // Snapshot of customer info at the time of ordering
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      // legacy snapshot note (kept for backward compatibility)
      notes: { type: String },
    },

    orderType: {
      type: String,
      enum: ["delivery", "pickup"],
      required: true,
      default: "delivery",
    },

    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true, default: 20 },
    total: { type: Number, required: true },

    // e.g., "Cash on Delivery", "PayPal", "Card"
    paymentMethod: { type: String, required: true },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded", "Completed"],
      default: "Pending",
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "On the Way",
        "Delivered",
        "Cancelled",
        "Pending Payment",
      ],
      default: "Pending",
    },

    statusHistory: [
      {
        status: { type: String },
        changedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],

    estimatedDeliveryTime: Date,

    driver: {
      name: String,
      phone: String,
      location: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },
  },
  { timestamps: true }
);

/* ---------- Indexes ---------- */
// Helpful for dashboards & analytics
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
// Do NOT add another explicit index for orderNumber here,
// since the field already has `unique: true` above. That avoids duplicate-index warnings.

/* ---------- Hooks (clean & minimal) ---------- */
// Guard: don't allow Delivered if payment explicitly Failed
orderSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    if (this.status === "Delivered" && this.paymentStatus === "Failed") {
      return next(new Error("Cannot mark Delivered for a failed payment"));
    }
  }
  next();
});

/* ---------- Instance helpers ---------- */
orderSchema.methods.updateStatus = async function (newStatus) {
  if (this.status === newStatus) return this;
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    note: `Status changed to ${newStatus}`,
  });
  return this.save();
};

orderSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Order", orderSchema);
