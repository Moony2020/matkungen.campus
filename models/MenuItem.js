// models/MenuItem.js
const mongoose = require("mongoose");

const ModifierOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, default: 0 },
});

const ModifierGroupSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "Toppings"
  required: { type: Boolean, default: false }, // must pick at least one?
  min: { type: Number, default: 0 },
  max: { type: Number, default: 0 }, // 0 = no limit
  options: { type: [ModifierOptionSchema], default: [] },
});

const SizeSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "Small", "Large"
  price: { type: Number, required: true },
});

const MenuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, index: true }, // "burgers","salads","pizza","drinks", etc.
    description: { type: String, default: "" },
    price: { type: Number, default: 0 }, // base price if no sizes
    sizes: { type: [SizeSchema], default: [] },
    modifiers: { type: [ModifierGroupSchema], default: [] },
    imageUrl: { type: String, default: "" }, // e.g. "/uploads/xxx.jpg"
    isActive: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MenuItem", MenuItemSchema);
