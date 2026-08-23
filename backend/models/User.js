const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    default: "",
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  guardianContact: {
    type: String,
    default: "",
  },
  profilePicture: {
    type: String,
    default: "",
  },
  authProvider: {
    type: String,
    default: "email",   // "email" | "google"
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
