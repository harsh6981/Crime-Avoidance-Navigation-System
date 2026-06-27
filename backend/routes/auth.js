const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const JWT_SECRET = process.env.JWT_SECRET || "REPLACE_WITH_A_STRONG_RANDOM_SECRET_STRING";

// In-memory user store fallback if MongoDB is not connected
const memoryUsers = [];

// ── SIGNUP ──
const handleSignup = async (req, res) => {
  try {
    const { name, email, phone, password, guardianContact } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    let existingUser = null;
    try {
      existingUser = await User.findOne({ email: email.toLowerCase() });
    } catch (dbErr) {
      existingUser = memoryUsers.find((u) => u.email === email.toLowerCase());
    }

    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered. Please login." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let newUser;
    try {
      newUser = new User({
        name,
        email: email.toLowerCase(),
        phone,
        password: hashedPassword,
        guardianContact: guardianContact || "",
      });
      await newUser.save();
    } catch (dbErr) {
      newUser = {
        _id: "mem_" + Date.now(),
        name,
        email: email.toLowerCase(),
        phone,
        password: hashedPassword,
        guardianContact: guardianContact || "",
      };
      memoryUsers.push(newUser);
    }

    const token = jwt.sign(
      { id: newUser._id, name: newUser.name, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      message: "User registered successfully!",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        guardianContact: newUser.guardianContact,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: "Internal server error during signup." });
  }
};

// ── LOGIN ──
const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide both email and password." });
    }

    let user = null;
    try {
      user = await User.findOne({ email: email.toLowerCase() });
    } catch (dbErr) {
      user = memoryUsers.find((u) => u.email === email.toLowerCase());
    }

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        guardianContact: user.guardianContact,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error during login." });
  }
};

// ── GET USER PROFILE ──
const handleMe = async (req, res) => {
  try {
    let user = null;
    try {
      user = await User.findById(req.user.id).select("-password");
    } catch (dbErr) {
      user = memoryUsers.find((u) => u._id === req.user.id);
    }

    if (!user) {
      return res.json({ user: req.user });
    }
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: "Error fetching profile." });
  }
};

// Mount routes for both `/signup`, `/login` and `/api/auth/signup`, `/api/auth/login`
router.post("/signup", handleSignup);
router.post("/login", handleLogin);
router.get("/me", authMiddleware, handleMe);

module.exports = router;
