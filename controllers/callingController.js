const db = require("../db");

// Helper to query promises
const queryPromise = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
};

// Helper to normalize phone number
function normalizePhone(p) {
  if (!p) return "";
  let digits = String(p).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

// Helper to map remark text from Excel to structured call status
function mapRemarkToStatus(remark) {
  if (!remark) return "pending";
  const r = String(remark).trim().toLowerCase();

  // Completed / Done / Birthday Wished
  if (r === "done" || r === "donw" || r === "completed" || r.includes("wished") || r.includes("birthday")) {
    return "birthday_wished";
  }

  // Invalid / Wrong Number / Out of service
  if (
    r.includes("invalid") ||
    r.includes("wrong") ||
    r.includes("out of ser") ||
    r.includes("not service") ||
    r === "na" ||
    r === "n/a"
  ) {
    return "invalid_number";
  }

  // Not reachable / Not answered / Busy / Switch off / Decline / Network issue
  if (
    r.includes("not rec") ||
    r.includes("not ans") ||
    r.includes("switch off") ||
    r.includes("not a") ||
    r.includes("not avail") ||
    r.includes("busy") ||
    r.includes("decline") ||
    r.includes("network") ||
    r.includes("not conn") ||
    r === "off"
  ) {
    return "not_reachable";
  }

  return "pending";
}

// Helper to parse date strings
function parseDob(val) {
  if (!val) return { dob: null, dob_day: null, dob_month: null };

  if (typeof val === "number") {
    const parsedDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(parsedDate.getTime())) {
      const y = parsedDate.getFullYear();
      const m = parsedDate.getMonth() + 1;
      const d = parsedDate.getDate();
      const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { dob: ymd, dob_day: d, dob_month: m };
    }
  }

  const str = String(val).trim();
  if (!str) return { dob: null, dob_day: null, dob_month: null };

  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += y > 30 ? 1900 : 2000;
    const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { dob: ymd, dob_day: d, dob_month: m };
  }

  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { dob: ymd, dob_day: d, dob_month: m };
  }

  return { dob: str, dob_day: null, dob_month: null };
}

// GET ALL LEADS (Paginated & Filtered)
exports.getLeads = async (req, res) => {
  try {
    const {
      category,
      assigned_to,
      call_status,
      birthday_filter,
      search,
      page = 1,
      limit = 50,
      sort_by = "id",
      sort_order = "DESC"
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Category filter
    if (category && category !== "all") {
      conditions.push("c.category = ?");
      params.push(category);
    }

    // Role-based visibility:
    const isCaller = req.user && (req.user.role === "employee" || req.user.role === "caller");
    
    if (isCaller) {
      // Calling employee can ONLY view leads assigned to their account
      conditions.push("c.assigned_to = ?");
      params.push(req.user.id);
    } else if (assigned_to !== undefined && assigned_to !== "" && assigned_to !== "all") {
      if (assigned_to === "unassigned") {
        conditions.push("(c.assigned_to IS NULL OR c.assigned_to = 0)");
      } else {
        conditions.push("c.assigned_to = ?");
        params.push(parseInt(assigned_to, 10));
      }
    }

    // Call status filter
    if (call_status && call_status !== "all") {
      if (call_status === "pending") {
        conditions.push("(c.call_status = 'pending' OR c.call_status IS NULL OR c.call_status = '')");
      } else {
        conditions.push("c.call_status = ?");
        params.push(call_status);
      }
    }

    // Birthday Filter
    if (birthday_filter) {
      if (birthday_filter === "today") {
        conditions.push("c.dob_month = MONTH(NOW()) AND c.dob_day = DAY(NOW())");
      } else if (birthday_filter === "this_month") {
        conditions.push("c.dob_month = MONTH(NOW())");
      } else if (birthday_filter === "blank" || birthday_filter === "no_dob") {
        conditions.push("(c.dob IS NULL OR c.dob = '' OR c.dob_month IS NULL)");
      } else if (birthday_filter === "unblank" || birthday_filter === "not_blank" || birthday_filter === "has_dob") {
        conditions.push("(c.dob IS NOT NULL AND c.dob != '' AND c.dob_month IS NOT NULL)");
      } else if (birthday_filter.startsWith("month_")) {
        const monthNum = parseInt(birthday_filter.replace("month_", ""), 10);
        if (monthNum >= 1 && monthNum <= 12) {
          conditions.push("c.dob_month = ?");
          params.push(monthNum);
        }
      }
    }

    // Text search
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push("(c.name LIKE ? OR c.phone LIKE ? OR c.visitor_id LIKE ? OR c.address LIKE ? OR c.purpose LIKE ? OR c.excel_remarks LIKE ? OR c.call_notes LIKE ?)");
      params.push(q, q, q, q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM calling_leads c${whereClause}`;
    const countResult = await queryPromise(countSql, params);
    const total = countResult[0]?.total || 0;

    // Fetch records
    const safeSort = ["id", "name", "phone", "dob_month", "dob_day", "called_at", "created_at"].includes(sort_by) ? sort_by : "id";
    const safeOrder = sort_order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const dataSql = `
      SELECT 
        c.*,
        a.username AS assigned_username,
        a.name AS assigned_name,
        a.phone AS assigned_phone
      FROM calling_leads c
      LEFT JOIN admins a ON c.assigned_to = a.id
      ${whereClause}
      ORDER BY c.${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const leads = await queryPromise(dataSql, [...params, limitNum, offset]);

    res.json({
      leads,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error("Error in getLeads:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET DISTINCT CATEGORIES
exports.getCategories = async (req, res) => {
  try {
    const isCaller = req.user && (req.user.role === "employee" || req.user.role === "caller");
    let whereClause = "";
    const params = [];
    if (isCaller) {
      whereClause = " WHERE assigned_to = ?";
      params.push(req.user.id);
    }
    const rows = await queryPromise(`
      SELECT 
        category, 
        COUNT(*) as total_count,
        SUM(CASE WHEN call_status = 'pending' OR call_status IS NULL THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN call_status != 'pending' AND call_status IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN assigned_to IS NULL OR assigned_to = 0 THEN 1 ELSE 0 END) as unassigned_count
      FROM calling_leads 
      ${whereClause}
      GROUP BY category 
      ORDER BY total_count DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET CALLING METRICS / STATS
exports.getCallingStats = async (req, res) => {
  try {
    const { category } = req.query;
    const isCaller = req.user && (req.user.role === "employee" || req.user.role === "caller");
    const conditions = [];
    const params = [];
    if (category && category !== "all") {
      conditions.push("category = ?");
      params.push(category);
    }
    if (isCaller) {
      conditions.push("assigned_to = ?");
      params.push(req.user.id);
    }
    const whereCat = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    const [generalStats, birthdayStats, callerBreakdown] = await Promise.all([
      queryPromise(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN call_status = 'pending' OR call_status IS NULL THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN call_status = 'called' THEN 1 ELSE 0 END) as called,
          SUM(CASE WHEN call_status = 'birthday_wished' THEN 1 ELSE 0 END) as birthday_wished,
          SUM(CASE WHEN call_status = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable,
          SUM(CASE WHEN call_status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_number,
          SUM(CASE WHEN call_status = 'resolved' THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN call_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN assigned_to IS NULL OR assigned_to = 0 THEN 1 ELSE 0 END) as unassigned,
          SUM(CASE WHEN assigned_to IS NOT NULL AND assigned_to > 0 THEN 1 ELSE 0 END) as assigned
        FROM calling_leads ${whereCat}
      `, params),

      queryPromise(`
        SELECT 
          SUM(CASE WHEN dob_month = MONTH(NOW()) AND dob_day = DAY(NOW()) THEN 1 ELSE 0 END) as today_birthdays,
          SUM(CASE WHEN dob_month = MONTH(NOW()) THEN 1 ELSE 0 END) as this_month_birthdays,
          SUM(CASE WHEN dob IS NULL OR dob = '' OR dob_month IS NULL THEN 1 ELSE 0 END) as blank_dob,
          SUM(CASE WHEN dob IS NOT NULL AND dob != '' AND dob_month IS NOT NULL THEN 1 ELSE 0 END) as unblank_dob,
          SUM(CASE WHEN dob_month = 1 THEN 1 ELSE 0 END) as month_1,
          SUM(CASE WHEN dob_month = 2 THEN 1 ELSE 0 END) as month_2,
          SUM(CASE WHEN dob_month = 3 THEN 1 ELSE 0 END) as month_3,
          SUM(CASE WHEN dob_month = 4 THEN 1 ELSE 0 END) as month_4,
          SUM(CASE WHEN dob_month = 5 THEN 1 ELSE 0 END) as month_5,
          SUM(CASE WHEN dob_month = 6 THEN 1 ELSE 0 END) as month_6,
          SUM(CASE WHEN dob_month = 7 THEN 1 ELSE 0 END) as month_7,
          SUM(CASE WHEN dob_month = 8 THEN 1 ELSE 0 END) as month_8,
          SUM(CASE WHEN dob_month = 9 THEN 1 ELSE 0 END) as month_9,
          SUM(CASE WHEN dob_month = 10 THEN 1 ELSE 0 END) as month_10,
          SUM(CASE WHEN dob_month = 11 THEN 1 ELSE 0 END) as month_11,
          SUM(CASE WHEN dob_month = 12 THEN 1 ELSE 0 END) as month_12
        FROM calling_leads ${whereCat}
      `, params),

      queryPromise(`
        SELECT 
          a.id as caller_id,
          a.username,
          a.name,
          a.phone,
          a.role,
          a.status,
          COUNT(c.id) as assigned_count,
          SUM(CASE WHEN c.call_status != 'pending' AND c.call_status IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN c.call_status = 'pending' OR c.call_status IS NULL THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN c.call_status = 'birthday_wished' THEN 1 ELSE 0 END) as birthday_wished_count,
          SUM(CASE WHEN c.call_status = 'called' THEN 1 ELSE 0 END) as called_count,
          SUM(CASE WHEN c.call_status = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable_count,
          SUM(CASE WHEN c.call_status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_count,
          SUM(CASE WHEN c.call_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
          SUM(CASE WHEN c.call_status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
          MAX(c.called_at) as last_called_at
        FROM admins a
        LEFT JOIN calling_leads c ON c.assigned_to = a.id ${category && category !== 'all' ? 'AND c.category = ?' : ''}
        WHERE a.role = 'employee' OR a.role = 'caller' OR a.role = 'admin'
        GROUP BY a.id, a.username, a.name
        ORDER BY assigned_count DESC
      `, category && category !== 'all' ? [category] : [])
    ]);

    res.json({
      metrics: generalStats[0] || {},
      birthdays: birthdayStats[0] || {},
      callers: callerBreakdown || []
    });
  } catch (err) {
    console.error("Error getting stats:", err);
    res.status(500).json({ error: err.message });
  }
};

// ASSIGN LEADS TO CALLER
exports.assignLeads = async (req, res) => {
  try {
    const { lead_ids, assigned_to, bulk_count, category, filter_status } = req.body;
    const callerId = assigned_to ? parseInt(assigned_to, 10) : null;

    // Option 1: Assign specific selected lead IDs
    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      const sql = "UPDATE calling_leads SET assigned_to = ? WHERE id IN (?)";
      const result = await queryPromise(sql, [callerId, lead_ids]);
      return res.json({
        message: `Successfully assigned ${result.affectedRows} leads.`,
        assignedCount: result.affectedRows
      });
    }

    // Option 2: Bulk assign next N unassigned leads in a category
    if (bulk_count && parseInt(bulk_count, 10) > 0) {
      const count = parseInt(bulk_count, 10);
      let selectSql = "SELECT id FROM calling_leads WHERE (assigned_to IS NULL OR assigned_to = 0)";
      const selectParams = [];

      if (category && category !== "all") {
        selectSql += " AND category = ?";
        selectParams.push(category);
      }

      if (filter_status && filter_status !== "all") {
        selectSql += " AND call_status = ?";
        selectParams.push(filter_status);
      }

      selectSql += " ORDER BY id ASC LIMIT ?";
      selectParams.push(count);

      const rowsToAssign = await queryPromise(selectSql, selectParams);
      if (rowsToAssign.length === 0) {
        return res.status(400).json({ message: "No unassigned leads found matching criteria." });
      }

      const ids = rowsToAssign.map(r => r.id);
      const updateSql = "UPDATE calling_leads SET assigned_to = ? WHERE id IN (?)";
      const updateRes = await queryPromise(updateSql, [callerId, ids]);

      return res.json({
        message: `Successfully assigned ${updateRes.affectedRows} leads to caller.`,
        assignedCount: updateRes.affectedRows
      });
    }

    return res.status(400).json({ error: "Please provide either lead_ids array or bulk_count." });
  } catch (err) {
    console.error("Error in assignLeads:", err);
    res.status(500).json({ error: err.message });
  }
};


// UPDATE FULL LEAD DATA (Admin Edit)
exports.updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      dob,
      category,
      visitor_id,
      visit_date,
      reference_by,
      purpose,
      address,
      call_status,
      call_notes,
      assigned_to
    } = req.body;

    const parsed = parseDob(dob);
    const cleanPhone = cleanPhoneNum(phone);

    const sql = `
      UPDATE calling_leads
      SET 
        name = ?,
        phone = ?,
        dob = ?,
        dob_day = ?,
        dob_month = ?,
        category = COALESCE(?, category),
        visitor_id = ?,
        visit_date = ?,
        reference_by = ?,
        purpose = ?,
        address = ?,
        call_status = COALESCE(?, call_status),
        call_notes = ?,
        assigned_to = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    await queryPromise(sql, [
      name ? String(name).trim() : null,
      cleanPhone || phone,
      parsed.dob || dob || null,
      parsed.dob_day,
      parsed.dob_month,
      category ? String(category).trim() : null,
      visitor_id || null,
      visit_date || null,
      reference_by || null,
      purpose || null,
      address || null,
      call_status || null,
      call_notes !== undefined ? call_notes : null,
      assigned_to !== undefined && assigned_to !== "" && assigned_to !== null ? parseInt(assigned_to, 10) : null,
      id
    ]);

    res.json({ message: "Lead updated successfully" });
  } catch (err) {
    console.error("Error updating lead:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPDATE CALL STATUS & NOTES FOR A LEAD
exports.updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { call_status, call_notes } = req.body;

    if (!call_status) {
      return res.status(400).json({ error: "call_status is required" });
    }

    let sql = "UPDATE calling_leads SET call_status = ?, call_notes = ?, called_at = NOW()";
    const params = [call_status, call_notes !== undefined ? call_notes : null];

    if (req.user && req.user.id) {
      sql += ", assigned_to = COALESCE(assigned_to, ?)";
      params.push(req.user.id);
    }

    sql += " WHERE id = ?";
    params.push(id);

    const result = await queryPromise(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({ message: "Call status updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPLOAD / IMPORT EXCEL DATA (With Automatic Deduplication & Remark-to-Status Mapping)
exports.uploadLeads = async (req, res) => {
  try {
    const { category = "Birthday Calling", rows = [] } = req.body;
    const targetCategory = category.trim() || "Birthday Calling";

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided for import." });
    }

    // 1. Fetch all existing phone numbers and visitor_ids in this category to prevent duplicate entries
    const existingRows = await queryPromise(
      "SELECT phone, visitor_id FROM calling_leads WHERE category = ?",
      [targetCategory]
    );

    const existingPhones = new Set();
    const existingVisitorIds = new Set();

    for (const r of existingRows) {
      if (r.phone) {
        const norm = normalizePhone(r.phone);
        if (norm) existingPhones.add(norm);
      }
      if (r.visitor_id) {
        const vid = String(r.visitor_id).trim();
        if (vid) existingVisitorIds.add(vid);
      }
    }

    // 2. Filter and deduplicate incoming rows (against DB and within the same file)
    const seenInBatchPhones = new Set();
    const seenInBatchVisitorIds = new Set();
    const rowsToInsert = [];
    let duplicateCount = 0;

    for (const r of rows) {
      const name = (r.name || r["Visitor Name"] || "").trim();
      const rawPhone = String(r.phone || r["Phone no"] || r.phone_number || "").trim();
      const normPhone = normalizePhone(rawPhone);

      if (!name && !normPhone) continue;

      const rawVisitorId = r.visitor_id || r["Visitor ID"] || null;
      const visitorId = rawVisitorId ? String(rawVisitorId).trim() : null;

      // Duplicate check
      const isPhoneDuplicate = normPhone && (existingPhones.has(normPhone) || seenInBatchPhones.has(normPhone));
      const isVidDuplicate = visitorId && (existingVisitorIds.has(visitorId) || seenInBatchVisitorIds.has(visitorId));

      if (isPhoneDuplicate || isVidDuplicate) {
        duplicateCount++;
        continue;
      }

      // Mark as seen in this batch
      if (normPhone) seenInBatchPhones.add(normPhone);
      if (visitorId) seenInBatchVisitorIds.add(visitorId);

      const rawDob = r.dob || r["DOB"] || r["Date of Birth"] || r.__EMPTY;
      const { dob, dob_day, dob_month } = parseDob(rawDob);
      const visitDate = r.visit_date || r["Visit Date"] || null;
      const referenceBy = r.reference_by || r["Reference By"] || null;
      const purpose = r.purpose || r["Purpose"] || null;
      const address = r.address || r["Visitor Address"] || null;
      const remarks = r.remarks || r["Remarks"] || r.excel_remarks || null;

      // Map Excel Remark to appropriate initial call status
      const initialStatus = mapRemarkToStatus(remarks);

      rowsToInsert.push([
        targetCategory,
        visitorId,
        name || "Unknown Visitor",
        normPhone || rawPhone || "N/A",
        dob,
        dob_day,
        dob_month,
        visitDate,
        referenceBy,
        purpose,
        address,
        remarks,
        null,
        initialStatus
      ]);
    }

    if (rowsToInsert.length === 0) {
      return res.json({
        message: `All ${duplicateCount} leads in this file already exist in "${targetCategory}" (0 duplicate leads added).`,
        insertedCount: 0,
        duplicateCount,
        totalProcessed: rows.length
      });
    }

    // 3. Batch insert unique records
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      const sql = `
        INSERT INTO calling_leads (
          category, visitor_id, name, phone, dob, dob_day, dob_month,
          visit_date, reference_by, purpose, address, excel_remarks,
          assigned_to, call_status
        ) VALUES ?
      `;
      await queryPromise(sql, [chunk]);
      inserted += chunk.length;
    }

    res.status(201).json({
      message: `Successfully imported ${inserted} new leads into "${targetCategory}". (${duplicateCount} duplicates skipped)`,
      insertedCount: inserted,
      duplicateCount,
      totalProcessed: rows.length
    });
  } catch (err) {
    console.error("Error in uploadLeads:", err);
    res.status(500).json({ error: err.message });
  }
};

// DELETE LEAD
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await queryPromise("DELETE FROM calling_leads WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json({ message: "Lead deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// BULK DELETE LEADS
exports.bulkDeleteLeads = async (req, res) => {
  try {
    const { lead_ids, category } = req.body;

    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      const result = await queryPromise("DELETE FROM calling_leads WHERE id IN (?)", [lead_ids]);
      return res.json({ message: `Deleted ${result.affectedRows} leads.` });
    }

    if (category) {
      const result = await queryPromise("DELETE FROM calling_leads WHERE category = ?", [category]);
      return res.json({ message: `Deleted ${result.affectedRows} leads from category ${category}.` });
    }

    return res.status(400).json({ error: "Please provide lead_ids or category." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// GET CALLER DETAILS & CALLING STATS
exports.getCallerDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = parseInt(id, 10);

    const [adminRows, statsRows, categoryRows, recentCalls] = await Promise.all([
      queryPromise("SELECT id, username, name, phone, role, status, created_at FROM admins WHERE id = ?", [callerId]),
      queryPromise(`
        SELECT 
          COUNT(*) as total_assigned,
          SUM(CASE WHEN call_status = 'pending' OR call_status IS NULL THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN call_status != 'pending' AND call_status IS NOT NULL THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN call_status = 'birthday_wished' THEN 1 ELSE 0 END) as birthday_wished,
          SUM(CASE WHEN call_status = 'called' THEN 1 ELSE 0 END) as called,
          SUM(CASE WHEN call_status = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable,
          SUM(CASE WHEN call_status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_number,
          SUM(CASE WHEN call_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN call_status = 'resolved' THEN 1 ELSE 0 END) as resolved,
          MAX(called_at) as last_called_at
        FROM calling_leads 
        WHERE assigned_to = ?
      `, [callerId]),
      queryPromise(`
        SELECT 
          category,
          COUNT(*) as total,
          SUM(CASE WHEN call_status != 'pending' AND call_status IS NOT NULL THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN call_status = 'pending' OR call_status IS NULL THEN 1 ELSE 0 END) as pending
        FROM calling_leads 
        WHERE assigned_to = ?
        GROUP BY category
      `, [callerId]),
      queryPromise(`
        SELECT id, name, phone, category, dob, call_status, call_notes, called_at
        FROM calling_leads
        WHERE assigned_to = ?
        ORDER BY (CASE WHEN called_at IS NOT NULL THEN called_at ELSE created_at END) DESC
        LIMIT 25
      `, [callerId])
    ]);

    if (!adminRows || adminRows.length === 0) {
      return res.status(404).json({ error: "Staff / Caller not found" });
    }

    res.json({
      caller: adminRows[0],
      stats: statsRows[0] || {},
      categories: categoryRows || [],
      recentLeads: recentCalls || []
    });
  } catch (err) {
    console.error("Error in getCallerDetails:", err);
    res.status(500).json({ error: err.message });
  }
};
