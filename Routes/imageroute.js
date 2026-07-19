const express = require("express");
const router = express.Router();
const {
  getAllImages,
  getImageById,
  getHeroImages,
  createImage,
  updateImage,
  deleteImage,
  getImagesByCategory,
  getCategories
} = require("../controllers/imageController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL IMAGES (latest first)
router.get("/", getAllImages);

// GET HERO IMAGES ONLY (isHeroSelectionImage = 1, latest first)
router.get("/hero", getHeroImages);

// GET ALL CATEGORIES
router.get("/categories", getCategories);

// GET BY ID
router.get("/:id", getImageById);

// GET IMAGES BY CATEGORY
router.get("/category/:category", getImagesByCategory);


// INSERT IMAGE
router.post("/", authMiddleware, createImage);

// UPDATE IMAGE
router.put("/:id", authMiddleware, updateImage);

// DELETE IMAGE
router.delete("/:id", authMiddleware, deleteImage);

module.exports = router;
