const express = require("express");
const router = express.Router();
const {
  getAllBlogs,
  getBlogByIdOrSlug,
  createBlog,
  updateBlog,
  deleteBlog,
  getBlogAuthors,
  getTopBlogs,
  getPublicBlogs
} = require("../controllers/blogController");
const authMiddleware = require("../middleware/authMiddleware");

// PUBLIC READ ENDPOINTS

// GET DISTINCT BLOG AUTHORS (returned as "categories")
router.get("/categories", getBlogAuthors);

// GET TOP 4 PUBLISHED BLOGS (latest first)
router.get("/top", getTopBlogs);

// GET ALL PUBLISHED BLOGS with optional ?search= filter
router.get("/public", getPublicBlogs);

// GET ALL BLOGS (admin - all statuses, full filters)
router.get("/", getAllBlogs);

// GET SINGLE BLOG BY ID OR SLUG
router.get("/:idOrSlug", getBlogByIdOrSlug);

// PROTECTED WRITE ENDPOINTS (Admin Authorization Required)
router.post("/", authMiddleware, createBlog);
router.put("/:id", authMiddleware, updateBlog);
router.delete("/:id", authMiddleware, deleteBlog);

module.exports = router;

