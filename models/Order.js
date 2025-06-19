// models/Order.js

const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  img: { type: String },
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    orderNumber: { type: String, required: true, unique: true },
    items: [orderItemSchema],
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      notes: { type: String },
    },

    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true, default: 20 },
    total: { type: Number, required: true },
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
        type: {
          type: String,
          default: "Point",
        },
        coordinates: {
          type: [Number],
          default: [0, 0],
        },
      },
    },
  },
  { timestamps: true }
);
// Remove the pre-save hook causing duplicate orders
// DELETE THIS WHOLE SECTION:
// Add payment verification middleware
// orderSchema.pre("save", function (next) {
//   if (
//     this.paymentMethod === "Cash on Delivery" &&
//     this.paymentStatus !== "Pending"
//   ) {
//     this.paymentStatus = "Pending";
//   } else if (
//     this.paymentMethod !== "Cash on Delivery" &&
//     this.paymentStatus === "Pending"
//   ) {
//     this.paymentStatus = "Paid";
//   }

//   next();
// });

orderSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status === "Completed") {
    if (this.paymentMethod === "PayPal" && this.paymentStatus !== "Paid") {
      return next(new Error("Cannot complete order without payment"));
    }
  }

  next();
});

if (
  this.paymentMethod === "Cash on Delivery" &&
  this.paymentStatus !== "Pending"
) {
  this.status = "Pending Payment";
} else if (
  this.paymentMethod !== "Cash on Delivery" &&
  this.status === "Pending Payment"
) {
  this.status = "Confirmed";
}

// Add pre-save hook to prevent unnecessary updates
orderSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status === this._originalStatus) {
    return next(new Error("Status unchanged"));
  }
  next();
});

// Add this in your update methods
orderSchema.methods.updateStatus = async function (newStatus) {
  if (this.status === newStatus) return this;
  this._originalStatus = this.status;
  this.status = newStatus;
  return this.save();
};

orderSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Order", orderSchema);
