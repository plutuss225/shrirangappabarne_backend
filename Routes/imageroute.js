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
  getCategories,
  getLatestImages
} = require("../controllers/imageController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL IMAGES (latest first)
router.get("/", getAllImages);

// GET LATEST 6 IMAGES
router.get("/latest", getLatestImages);

// GET HERO IMAGES ONLY (isHeroSelectionImage = 1, latest first)
router.get("/hero", getHeroImages);

// GET ALL CATEGORIES
router.get("/categories", getCategories);

// GET IMAGES BY CATEGORY — must be before /:id to avoid route shadowing
router.get("/category/:category", getImagesByCategory);

// GET BY ID
router.get("/:id", getImageById);


// INSERT IMAGE
router.post("/", authMiddleware, createImage);

// UPDATE IMAGE
router.put("/:id", authMiddleware, updateImage);

// DELETE IMAGE
router.delete("/:id", authMiddleware, deleteImage);

module.exports = router;
