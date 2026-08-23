const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const User    = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "REPLACE_WITH_A_STRONG_RANDOM_SECRET_STRING";

// In-memory fallback for when MongoDB is not connected
const memoryUsers = [];

/**
 * POST /api/auth/google
 *
 * Accepts a Firebase ID token from the frontend after a Google Sign-In popup.
 *
 * Flow:
 *  1. Decode the Firebase ID token (we trust it in dev; use firebase-admin to verify in prod)
 *  2. Upsert user in MongoDB (create if new, find if existing)
 *  3. Issue our own JWT and return it to the frontend
 *
 * To add full Firebase Admin verification in production:
 *   npm install firebase-admin --save
 *   Then replace the decode step with admin.auth().verifyIdToken(idToken)
 */
router.post("/google", async (req, res) => {
  try {
    const { idToken, name, email, profilePicture } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Google account email is required." });
    }

    // ── Dev Mode: Decode JWT without verification ──
    // In production: replace this with firebase-admin verifyIdToken
    let googleEmail = email;
    let googleName  = name  || email.split("@")[0];
    let googlePhoto = profilePicture || "";

    // Try to decode the Firebase token for extra data (no signature check in dev)
    if (idToken) {
      try {
        const decoded = jwt.decode(idToken);
        if (decoded) {
          googleEmail = decoded.email || email;
          googleName  = decoded.name  || name || googleEmail.split("@")[0];
          googlePhoto = decoded.picture || profilePicture || "";
        }
      } catch (_) {
        // Token decode failed — use values from request body
      }
    }

    const normalizedEmail = googleEmail.toLowerCase();

    // ── Upsert user in MongoDB ──
    let user = null;
    try {
      user = await User.findOne({ email: normalizedEmail });

      if (!user) {
        // New Google user — create account (no password needed)
        user = new User({
          name:            googleName,
          email:           normalizedEmail,
          phone:           "",
          password:        "google_oauth_no_password_" + Date.now(),
          guardianContact: "",
          profilePicture:  googlePhoto,
          authProvider:    "google",
        });
        await user.save();
      } else {
        // Existing user — update profile picture if changed
        if (googlePhoto && user.profilePicture !== googlePhoto) {
          user.profilePicture = googlePhoto;
          await user.save();
        }
      }
    } catch (dbErr) {
      // MongoDB unavailable — use in-memory fallback
      user = memoryUsers.find((u) => u.email === normalizedEmail);
      if (!user) {
        user = {
          _id:            "google_mem_" + Date.now(),
          name:            googleName,
          email:           normalizedEmail,
          profilePicture:  googlePhoto,
          authProvider:    "google",
        };
        memoryUsers.push(user);
      }
    }

    // ── Issue our own JWT ──
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Google login successful!",
      token,
      user: {
        id:             user._id,
        name:           user.name,
        email:          user.email,
        profilePicture: user.profilePicture || googlePhoto,
        authProvider:   "google",
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(500).json({ message: "Internal server error during Google authentication." });
  }
});

module.exports = router;
