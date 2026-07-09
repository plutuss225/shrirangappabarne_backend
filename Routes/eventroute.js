const express = require("express");
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent
} = require("../controllers/eventcontroller");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL EVENTS
router.get("/", getAllEvents);

// GET BY ID
router.get("/:id", getEventById);

// INSERT EVENT
router.post("/", authMiddleware, createEvent);

// UPDATE EVENT
router.put("/:id", authMiddleware, updateEvent);

// DELETE EVENT
router.delete("/:id", authMiddleware, deleteEvent);

module.exports = router;
