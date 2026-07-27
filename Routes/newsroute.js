const express = require("express");
const router = express.Router();
const {
  getAllNews,
  getNewsById,
  createNews,
  updateNews,
  deleteNews,
  getCategories,
  getCategoriesWithLatestNews,
  getNewsByCategory,
  getTopNewsByCategory,
  getLatestNews
} = require("../controllers/newsController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL NEWS
router.get("/", getAllNews);

// GET LATEST 3 NEWS
router.get("/latest", getLatestNews);

// GET DISTINCT CATEGORIES (max 4)
router.get("/categories", getCategories);

// GET CATEGORIES WITH LATEST NEWS
router.get("/categories-with-latest", getCategoriesWithLatestNews);

// GET ALL NEWS BY CATEGORY (latest first, optional ?category=Sports)
router.get("/by-category", getNewsByCategory);

// GET TOP 3 NEWS BY CATEGORY (max 3, optional ?category=Sports)
router.get("/by-category/top", getTopNewsByCategory);

// GET BY ID
router.get("/:id", getNewsById);

// INSERT NEWS
router.post("/", authMiddleware, createNews);

// UPDATE NEWS
router.put("/:id", authMiddleware, updateNews);

// DELETE NEWS
router.delete("/:id", authMiddleware, deleteNews);

module.exports = router;