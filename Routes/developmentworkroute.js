const express = require("express");
const router = express.Router();
const {
  getAllDevelopmentWork,
  getDevelopmentWorkById,
  createDevelopmentWork,
  updateDevelopmentWork,
  deleteDevelopmentWork,
  getCategories,
  getDevelopmentWorkByCategory,
  getTopDevelopmentWorkByCategory
} = require("../controllers/developmentWorkController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL NEWS
router.get("/", getAllDevelopmentWork);

// GET DISTINCT CATEGORIES (max 4)
router.get("/categories", getCategories);

// GET ALL NEWS BY CATEGORY (latest first, optional ?category=Sports)
router.get("/by-category", getDevelopmentWorkByCategory);

// GET TOP 3 NEWS BY CATEGORY (max 3, optional ?category=Sports)
router.get("/by-category/top", getTopDevelopmentWorkByCategory);

// GET BY ID
router.get("/:id", getDevelopmentWorkById);

// INSERT NEWS
router.post("/", authMiddleware, createDevelopmentWork);

// UPDATE NEWS
router.put("/:id", authMiddleware, updateDevelopmentWork);

// DELETE NEWS
router.delete("/:id", authMiddleware, deleteDevelopmentWork);

module.exports = router;