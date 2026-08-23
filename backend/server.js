const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes       = require("./routes/auth");
const googleAuthRoutes = require("./routes/googleAuth");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/safepath";

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Express Auth Backend: Connected to MongoDB"))
  .catch((err) =>
    console.log("⚠️ Express Auth Backend: MongoDB not reachable locally — running with in-memory authentication fallback.")
  );

// Mount authentication routes
app.use("/", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);   // POST /api/auth/google

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "SafePath Auth Server is active" });
});

app.listen(PORT, () => {
  console.log(`🚀 SafePath Auth Server running on http://localhost:${PORT}`);
});
