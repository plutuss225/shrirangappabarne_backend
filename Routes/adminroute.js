const express = require("express");
const router = express.Router();
const { login, createAdmin, getAllAdmins, getStats, getLatestData, getAllNewsCategories } = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");

// LOGIN (simple)
router.post("/login", login);

// GET STATS
router.get("/stats", authMiddleware, getStats);

// GET LATEST DATA (latest 5 news, blogs, admins)
router.get("/latest", authMiddleware, getLatestData);

// GET ALL NEWS CATEGORIES
router.get("/news-categories", authMiddleware, getAllNewsCategories);

// GET ALL ADMINS
router.get("/", authMiddleware, getAllAdmins);

// CREATE ADMIN
router.post("/", authMiddleware, createAdmin);

module.exports = router;