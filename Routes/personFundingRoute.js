const express = require("express");
const router = express.Router();
const {
  getAllPersonFunding,
  getPersonFundingById,
  createPersonFunding,
  updatePersonFunding,
  deletePersonFunding
} = require("../controllers/personFundingController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL PERSON FUNDING (no token required)
router.get("/", getAllPersonFunding);

// GET PERSON FUNDING BY ID (no token required)
router.get("/:id", getPersonFundingById);

// CREATE PERSON FUNDING (token required)
router.post("/", authMiddleware, createPersonFunding);

// UPDATE PERSON FUNDING (token required)
router.put("/:id", authMiddleware, updatePersonFunding);

// DELETE PERSON FUNDING (token required)
router.delete("/:id", authMiddleware, deletePersonFunding);

module.exports = router;
