const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const {
  getAllPersonFunding,
  getPersonFundingById,
  createPersonFunding,
  updatePersonFunding,
  deletePersonFunding,
  uploadPersonFundingExcel,
  downloadPersonFundingTemplate
} = require("../controllers/personFundingController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL PERSON FUNDING (no token required)
router.get("/", getAllPersonFunding);

// DOWNLOAD TEMPLATE (no token required or token optional)
router.get("/template", downloadPersonFundingTemplate);

// UPLOAD EXCEL (token required)
router.post("/upload-excel", authMiddleware, upload.single("file"), uploadPersonFundingExcel);

// GET PERSON FUNDING BY ID (no token required)
router.get("/:id", getPersonFundingById);

// CREATE PERSON FUNDING (token required)
router.post("/", authMiddleware, createPersonFunding);

// UPDATE PERSON FUNDING (token required)
router.put("/:id", authMiddleware, updatePersonFunding);

// DELETE PERSON FUNDING (token required)
router.delete("/:id", authMiddleware, deletePersonFunding);

module.exports = router;
