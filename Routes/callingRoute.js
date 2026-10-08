const express = require("express");
const router = express.Router();
const {
  getLeads,
  getCategories,
  getCallingStats,
  getCallerDetails,
  assignLeads,
  updateLeadStatus,
  updateLead,
  uploadLeads,
  deleteLead,
  bulkDeleteLeads
} = require("../controllers/callingController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL LEADS
router.get("/leads", authMiddleware, getLeads);

// GET DISTINCT CATEGORIES
router.get("/categories", authMiddleware, getCategories);

// GET CALLING METRICS
router.get("/stats", authMiddleware, getCallingStats);

// GET SINGLE CALLER DETAILS & STATS
router.get("/callers/:id", authMiddleware, getCallerDetails);

// ASSIGN LEADS TO CALLER
router.post("/assign", authMiddleware, assignLeads);

// UPDATE FULL LEAD DATA (Admin)
router.put("/leads/:id", authMiddleware, updateLead);

// UPDATE CALL STATUS & NOTES
router.put("/leads/:id/status", authMiddleware, updateLeadStatus);

// UPLOAD / IMPORT EXCEL DATA
router.post("/upload", authMiddleware, uploadLeads);

// DELETE LEAD
router.delete("/leads/:id", authMiddleware, deleteLead);

// BULK DELETE LEADS
router.post("/leads/bulk-delete", authMiddleware, bulkDeleteLeads);

module.exports = router;
