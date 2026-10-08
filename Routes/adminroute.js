const express = require("express");
const router = express.Router();
const { 
  login, 
  createAdmin, 
  getAllAdmins, 
  updateUser, 
  deleteUser, 
  getStats, 
  getCallingStats,
  getLatestData, 
  getAllNewsCategories 
} = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");

// LOGIN (supports all roles)
router.post("/login", login);

// GET STATS
router.get("/stats", authMiddleware, getStats);

// GET CALLING STATS
router.get("/calling-stats", authMiddleware, getCallingStats);

// GET LATEST DATA (latest 5 news, blogs, admins)
router.get("/latest", authMiddleware, getLatestData);

// GET ALL NEWS CATEGORIES
router.get("/news-categories", authMiddleware, getAllNewsCategories);

// GET ALL USERS / ADMINS / EMPLOYEES
router.get("/", authMiddleware, getAllAdmins);

// CREATE USER (Admin or Employee for Calling)
router.post("/", authMiddleware, createAdmin);

// UPDATE USER
router.put("/:id", authMiddleware, updateUser);

// DELETE USER
router.delete("/:id", authMiddleware, deleteUser);

module.exports = router;
