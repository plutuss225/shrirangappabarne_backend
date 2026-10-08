const express = require("express");
const router = express.Router();
const { 
  createContact, 
  getAllContacts, 
  updateCallStatus, 
  markAsRead, 
  deleteContact 
} = require("../controllers/contactController");
const authMiddleware = require("../middleware/authMiddleware");

// CREATE contact message (Public)
router.post("/", createContact);

// GET all contact messages (Admin & Calling Staff)
router.get("/", authMiddleware, getAllContacts);

// UPDATE CALL STATUS & NOTES (For Calling Staff)
router.put("/:id/call-status", authMiddleware, updateCallStatus);

// MARK contact message as read
router.put("/:id/read", authMiddleware, markAsRead);

// DELETE contact message (Admin only)
router.delete("/:id", authMiddleware, deleteContact);

module.exports = router;
