const express = require("express");
const router = express.Router();
const {
  getAllEventFunding,
  getEventFundingById,
  createEventFunding,
  updateEventFunding,
  deleteEventFunding,
  getUniquePlaces,
  getUniqueDates
} = require("../controllers/eventFundingController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL EVENT FUNDING (no token required)
router.get("/", getAllEventFunding);

// GET UNIQUE PLACES
router.get("/places", getUniquePlaces);

// GET UNIQUE DATES
router.get("/dates", getUniqueDates);

// GET EVENT FUNDING BY ID (no token required)
router.get("/:id", getEventFundingById);

// CREATE EVENT FUNDING (token required)
router.post("/", authMiddleware, createEventFunding);

// UPDATE EVENT FUNDING (token required)
router.put("/:id", authMiddleware, updateEventFunding);

// DELETE EVENT FUNDING (token required)
router.delete("/:id", authMiddleware, deleteEventFunding);

module.exports = router;
