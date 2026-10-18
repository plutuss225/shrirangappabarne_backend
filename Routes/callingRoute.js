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
  bulkDeleteLeads,
  getLeadCallLogs,
  getAllCallLogs
} = require("../controllers/callingController");
const { updateMyStatus } = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");

// UPDATE OWN STATUS (Activate or Inactivate)
router.put("/status", authMiddleware, updateMyStatus);
router.patch("/status", authMiddleware, updateMyStatus);

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


// GET CALL LOGS FOR A SPECIFIC LEAD
router.get("/leads/:id/logs", authMiddleware, getLeadCallLogs);

// GET ALL CALL LOGS
router.get("/logs", authMiddleware, getAllCallLogs);

// DELETE LEAD
router.delete("/leads/:id", authMiddleware, deleteLead);

// BULK DELETE LEADS
router.post("/leads/bulk-delete", authMiddleware, bulkDeleteLeads);

module.exports = router;
