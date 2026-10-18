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
  getAllNewsCategories,
  getMe,
  logout,
  updateMyStatus,
  employeeSignup,
  updateMyProfile
} = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");

// LOGIN (supports all roles)
router.post("/login", login);

// EMPLOYEE SIGNUP (Public - allows callers to register themselves)
router.post("/signup", employeeSignup);
router.post("/register", employeeSignup);

// GET CURRENT USER
router.get("/me", authMiddleware, getMe);

// UPDATE OWN PROFILE (Name & Calling Phone Number)
router.put("/profile", authMiddleware, updateMyProfile);
router.patch("/profile", authMiddleware, updateMyProfile);

// UPDATE OWN STATUS (Activate or Inactivate himself)
router.put("/status", authMiddleware, updateMyStatus);
router.patch("/status", authMiddleware, updateMyStatus);

// LOGOUT
router.post("/logout", logout);

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
