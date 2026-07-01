const express = require("express");
const router = express.Router();
const { createContact, getAllContacts, markAsRead, deleteContact } = require("../controllers/contactController");
const authMiddleware = require("../middleware/authMiddleware");

// Create message (Public)
router.post("/", createContact);

// Get all messages (Admin)
router.get("/", authMiddleware, getAllContacts);

// Mark as read (Admin)
router.put("/:id/read", authMiddleware, markAsRead);

// Delete message (Admin)
router.delete("/:id", authMiddleware, deleteContact);

module.exports = router;
