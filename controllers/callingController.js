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
  // In case of multiple phones like "9623478203 / 7028974987", take first phone
  const first = String(p).split(/[\/,\&]/)[0];
  let digits = first.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

const cleanPhoneNum = normalizePhone;

// Helper to map remark text from Excel to structured call status
function mapRemarkToStatus(remark, category = "") {
  if (!remark) return "pending";
  const r = String(remark).trim().toLowerCase();

  // Completed / Done / Birthday Wished
  if (r === "done" || r === "donw" || r === "completed" || r.includes("wished") || r.includes("birthday")) {
    const isBirthday = !category || String(category).toLowerCase().includes("birthday");
    return isBirthday ? "birthday_wished" : "completed";
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

  // Callback in Excel remarks
  if (r.includes("callback") || r.includes("call back") || r.includes("पुन्हा")) {
    return "callback";
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
      sub_category,
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

    // Sub-category filter (e.g. Male / Female)
    if (sub_category && sub_category !== "all") {
      conditions.push("c.sub_category = ?");
      params.push(sub_category);
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
      } else if (call_status === "all_completed" || call_status === "total_dialed") {
        conditions.push("(c.call_status != 'pending' AND c.call_status IS NOT NULL AND c.call_status != '')");
      } else if (call_status === "completed") {
        conditions.push("(c.call_status = 'completed' OR c.call_status = 'called' OR c.call_status = 'resolved' OR c.call_status = 'birthday_wished')");
      } else if (call_status === "not_reachable_all") {
        conditions.push("(c.call_status = 'not_reachable' OR c.call_status = 'invalid_number')");
      } else if (call_status === "not_reachable") {
        conditions.push("c.call_status = 'not_reachable'");
      } else if (call_status === "invalid_number") {
        conditions.push("c.call_status = 'invalid_number'");
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
      conditions.push("(c.name LIKE ? OR c.phone LIKE ? OR c.visitor_id LIKE ? OR c.address LIKE ? OR c.purpose LIKE ? OR c.excel_remarks LIKE ? OR c.call_notes LIKE ? OR c.sub_category LIKE ?)");
      params.push(q, q, q, q, q, q, q, q);
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

// GET DISTINCT CATEGORIES (With Sub-categories breakdown, scoped according to assigned leads)
exports.getCategories = async (req, res) => {
  try {
    const isCaller = req.user && (req.user.role === "employee" || req.user.role === "caller");
    const assignedParam = req.query.assigned_to || req.query.assigned || req.query.caller_id;

    let whereConditions = ["category IS NOT NULL", "category != ''"];
    const params = [];

    if (isCaller) {
      whereConditions.push("assigned_to = ?");
      params.push(req.user.id);
    } else if (assignedParam && assignedParam !== "all") {
      if (assignedParam === "unassigned") {
        whereConditions.push("(assigned_to IS NULL OR assigned_to = 0)");
      } else {
        whereConditions.push("assigned_to = ?");
        params.push(parseInt(assignedParam, 10));
      }
    }

    const whereClause = " WHERE " + whereConditions.join(" AND ");

    const [rows, subRows] = await Promise.all([
      queryPromise(`
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
      `, params),

      queryPromise(`
        SELECT 
          category, 
          sub_category, 
          COUNT(*) as count
        FROM calling_leads
        ${whereClause} AND sub_category IS NOT NULL AND sub_category != ''
        GROUP BY category, sub_category
        ORDER BY category, sub_category
      `, params)
    ]);

    const subMap = {};
    for (const s of subRows) {
      if (!subMap[s.category]) subMap[s.category] = [];
      subMap[s.category].push({ sub_category: s.sub_category, count: s.count });
    }

    const result = rows.map(r => ({
      ...r,
      sub_categories: subMap[r.category] || []
    }));

    res.json(result);
  } catch (err) {
    console.error("Error in getCategories:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET CALLING METRICS / STATS
exports.getCallingStats = async (req, res) => {
  try {
    const { category, sub_category } = req.query;
    const isCaller = req.user && (req.user.role === "employee" || req.user.role === "caller");
    
    // Category base conditions (WITHOUT sub_category filter)
    const catConditions = [];
    const catParams = [];
    if (category && category !== "all") {
      catConditions.push("category = ?");
      catParams.push(category);
    }
    if (isCaller) {
      catConditions.push("assigned_to = ?");
      catParams.push(req.user.id);
    }
    const catWhere = catConditions.length > 0 ? " WHERE " + catConditions.join(" AND ") : "";

    // Subcategory-filtered conditions (WITH sub_category filter)
    const conditions = [...catConditions];
    const params = [...catParams];
    if (sub_category && sub_category !== "all") {
      conditions.push("sub_category = ?");
      params.push(sub_category);
    }
    const whereCat = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    const [generalStats, catSubStats, birthdayStats, callerBreakdown] = await Promise.all([
      queryPromise(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN call_status = 'pending' OR call_status IS NULL OR call_status = '' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN call_status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN call_status = 'called' THEN 1 ELSE 0 END) as called,
          SUM(CASE WHEN call_status = 'birthday_wished' THEN 1 ELSE 0 END) as birthday_wished,
          SUM(CASE WHEN call_status = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable,
          SUM(CASE WHEN call_status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_number,
          SUM(CASE WHEN call_status = 'callback' THEN 1 ELSE 0 END) as callback,
          SUM(CASE WHEN call_status = 'resolved' THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN call_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN call_status != 'pending' AND call_status IS NOT NULL AND call_status != '' THEN 1 ELSE 0 END) as total_dialed,
          SUM(CASE WHEN assigned_to IS NULL OR assigned_to = 0 THEN 1 ELSE 0 END) as unassigned,
          SUM(CASE WHEN assigned_to IS NOT NULL AND assigned_to > 0 THEN 1 ELSE 0 END) as assigned
        FROM calling_leads ${whereCat}
      `, params),

      // Compute category-wide male, female and category_total counts so they NEVER drop or change when filtering by sub_category
      queryPromise(`
        SELECT 
          COUNT(*) as category_total,
          SUM(CASE WHEN sub_category = 'Male' OR sub_category = 'पुरुष' THEN 1 ELSE 0 END) as male_count,
          SUM(CASE WHEN sub_category = 'Female' OR sub_category = 'महिला' THEN 1 ELSE 0 END) as female_count
        FROM calling_leads ${catWhere}
      `, catParams),

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
          SUM(CASE WHEN c.call_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN c.call_status != 'pending' AND c.call_status IS NOT NULL AND c.call_status != '' THEN 1 ELSE 0 END) as total_dialed_count,
          SUM(CASE WHEN c.call_status = 'pending' OR c.call_status IS NULL THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN c.call_status = 'birthday_wished' THEN 1 ELSE 0 END) as birthday_wished_count,
          SUM(CASE WHEN c.call_status = 'called' THEN 1 ELSE 0 END) as called_count,
          SUM(CASE WHEN c.call_status = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable_count,
          SUM(CASE WHEN c.call_status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_count,
          SUM(CASE WHEN c.call_status = 'callback' THEN 1 ELSE 0 END) as callback_count,
          SUM(CASE WHEN c.call_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
          SUM(CASE WHEN c.call_status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
          MAX(c.called_at) as last_called_at
        FROM admins a
        LEFT JOIN calling_leads c ON c.assigned_to = a.id ${category && category !== 'all' ? 'AND c.category = ?' : ''} ${sub_category && sub_category !== 'all' ? 'AND c.sub_category = ?' : ''}
        WHERE (a.role = 'employee' OR a.role = 'caller' OR a.role = 'admin') AND (a.isDelete = 0 OR a.isDelete IS NULL) AND (a.isDeleted = 0 OR a.isDeleted IS NULL)
        GROUP BY a.id, a.username, a.name
        ORDER BY assigned_count DESC
      `, [
        ...(category && category !== 'all' ? [category] : []),
        ...(sub_category && sub_category !== 'all' ? [sub_category] : [])
      ])
    ]);

    const combinedMetrics = {
      ...(generalStats[0] || {}),
      category_total: catSubStats[0]?.category_total ?? (generalStats[0]?.total || 0),
      male_count: catSubStats[0]?.male_count || 0,
      female_count: catSubStats[0]?.female_count || 0,
    };

    res.json({
      metrics: combinedMetrics,
      birthdays: birthdayStats[0] || {},
      callers: callerBreakdown || []
    });
  } catch (err) {
    console.error("Error getting stats:", err);
    res.status(500).json({ error: err.message });
  }
};

// ASSIGN LEADS TO CALLER (Supports bulk assign with category & sub_category)
exports.assignLeads = async (req, res) => {
  try {
    const { lead_ids, assigned_to, bulk_count, category, sub_category, filter_status } = req.body;
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

    // Option 2: Bulk assign next N unassigned leads in a category & sub_category
    if (bulk_count && parseInt(bulk_count, 10) > 0) {
      const count = parseInt(bulk_count, 10);
      let selectSql = "SELECT id FROM calling_leads WHERE (assigned_to IS NULL OR assigned_to = 0)";
      const selectParams = [];

      if (category && category !== "all") {
        selectSql += " AND category = ?";
        selectParams.push(category);
      }

      if (sub_category && sub_category !== "all") {
        selectSql += " AND sub_category = ?";
        selectParams.push(sub_category);
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
      sub_category,
      visitor_id,
      visit_date,
      reference_by,
      purpose,
      address,
      call_status,
      call_notes,
      assigned_to
    } = req.body;

    const existing = await queryPromise("SELECT id, name, phone, call_status, assigned_to FROM calling_leads WHERE id = ?", [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const currentLead = existing[0];
    const previousStatus = currentLead.call_status || "pending";
    const statusChanged = Boolean(call_status && call_status !== previousStatus);

    const parsed = parseDob(dob);
    const cleanPhone = normalizePhone(phone);

    const sql = `
      UPDATE calling_leads
      SET 
        name = ?,
        phone = ?,
        dob = ?,
        dob_day = ?,
        dob_month = ?,
        category = COALESCE(?, category),
        sub_category = COALESCE(?, sub_category),
        visitor_id = ?,
        visit_date = ?,
        reference_by = ?,
        purpose = ?,
        address = ?,
        call_status = COALESCE(?, call_status),
        call_notes = ?,
        assigned_to = ?,
        ${statusChanged ? (call_status === 'pending' ? 'called_at = NULL,' : 'called_at = NOW(),') : ''}
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
      sub_category ? String(sub_category).trim() : null,
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

    // If status changed or notes updated, insert audit log into call_logs
    if (call_status || call_notes !== undefined) {
      const newStatus = call_status || previousStatus;
      if (statusChanged || call_notes !== undefined) {
        try {
          const callerId = (req.user && req.user.id) || (assigned_to ? parseInt(assigned_to, 10) : currentLead.assigned_to) || null;
          let callerNumber = null;
          let callerName = req.user?.name || req.user?.username || null;
          if (callerId) {
            const callerRows = await queryPromise("SELECT phone, name, username FROM admins WHERE id = ?", [callerId]);
            if (callerRows && callerRows.length > 0) {
              callerNumber = callerRows[0].phone || null;
              callerName = callerRows[0].name || callerRows[0].username || callerName;
            }
          }

          await queryPromise(
            `INSERT INTO call_logs (
              lead_id, caller_id, caller_number, customer_number,
              previous_status, call_status, notes, raw_response, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              id,
              callerId,
              callerNumber,
              cleanPhone || currentLead.phone || "N/A",
              previousStatus,
              newStatus,
              call_notes !== undefined ? call_notes : null,
              JSON.stringify({
                source: "admin_lead_edit",
                admin_id: req.user?.id || null,
                timestamp: new Date().toISOString()
              })
            ]
          );
        } catch (logErr) {
          console.error("Failed to insert call log during updateLead:", logErr);
        }
      }
    }

    res.json({ message: "Lead updated successfully" });
  } catch (err) {
    console.error("Error in updateLead:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPDATE CALL STATUS & NOTES (Logged by Callers / Staff)
exports.updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { call_status, call_notes } = req.body;

    if (!call_status) {
      return res.status(400).json({ error: "call_status is required" });
    }

    // 1. Fetch current lead state
    const existing = await queryPromise("SELECT id, name, phone, call_status, assigned_to FROM calling_leads WHERE id = ?", [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const currentLead = existing[0];
    const previousStatus = currentLead.call_status || "pending";
    const customerNumber = currentLead.phone || "N/A";

    // 2. Determine caller identity
    const callerId = (req.user && req.user.id) || currentLead.assigned_to || null;
    let callerNumber = null;
    let callerName = req.user?.name || req.user?.username || null;
    if (callerId) {
      const callerRows = await queryPromise("SELECT phone, name, username FROM admins WHERE id = ?", [callerId]);
      if (callerRows && callerRows.length > 0) {
        callerNumber = callerRows[0].phone || null;
        callerName = callerRows[0].name || callerRows[0].username || callerName;
      }
    }

    // 3. Update calling_leads
    let sql = "UPDATE calling_leads SET call_status = ?, call_notes = ?";
    if (call_status === "pending") {
      sql += ", called_at = NULL";
    } else {
      sql += ", called_at = NOW()";
    }
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

    // 4. Insert audit entry into call_logs
    let logId = null;
    try {
      const logResult = await queryPromise(
        `INSERT INTO call_logs (
          lead_id, caller_id, caller_number, customer_number,
          previous_status, call_status, notes, raw_response, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          id,
          callerId,
          callerNumber,
          customerNumber || "N/A",
          previousStatus,
          call_status,
          call_notes !== undefined ? call_notes : null,
          JSON.stringify({
            source: "dashboard_status_update",
            caller_id: callerId,
            caller_name: callerName,
            timestamp: new Date().toISOString()
          })
        ]
      );
      logId = logResult.insertId;
    } catch (logErr) {
      console.error("Failed to insert into call_logs:", logErr);
    }

    res.json({
      message: "Call status updated successfully",
      log_id: logId,
      previous_status: previousStatus,
      call_status
    });
  } catch (err) {
    console.error("Error updating lead call status:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPLOAD / IMPORT EXCEL DATA (Handles Marathi Constituency files & Standard reports)
exports.uploadLeads = async (req, res) => {
  try {
    const { category = "Birthday Calling", sub_category = null, rows = [] } = req.body;
    const targetCategory = category.trim() || "Birthday Calling";
    const targetSubCategory = sub_category ? sub_category.trim() : null;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided for import." });
    }

    // 1. Fetch existing phones and visitor IDs in this category to prevent duplicate entries
    const existingRows = await queryPromise(
      "SELECT phone, visitor_id, sub_category FROM calling_leads WHERE category = ?",
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
        const sub = r.sub_category ? String(r.sub_category).trim().toLowerCase() : "";
        if (vid) existingVisitorIds.add(`${sub}::${vid}`);
      }
    }

    // 2. Filter and deduplicate incoming rows
    const seenInBatchPhones = new Set();
    const seenInBatchVisitorIds = new Set();
    const rowsToInsert = [];
    let duplicateCount = 0;

    for (const r of rows) {
      // Robust name detection across standard and Marathi formats
      const name = (
        r.name ||
        r["Visitor Name"] ||
        r["चिंचवड विधानसभा "] ||
        r["चिंचवड विधानसभा"] ||
        r["पिंपरी विधानसभा "] ||
        r["पिंपरी विधानसभा"] ||
        r["नाव"] ||
        r["Name"] ||
        ""
      ).trim();

      const rawPhone = String(
        r.phone ||
        r["Phone no"] ||
        r.phone_number ||
        r["संपर्क क्र."] ||
        r["संपर्क क्र"] ||
        r["संपर्क"] ||
        r["Mobile"] ||
        ""
      ).trim();

      const normPhone = normalizePhone(rawPhone);

      const purpose = (r.purpose || r["Purpose"] || r["पद "] || r["पद"] || r["Designation"] || null);
      const address = (r.address || r["Visitor Address"] || r["कार्यक्षेत्र"] || r["Address"] || null);

      // Still upload even if there is NO phone number (only skip if entire row has no name, purpose or address)
      if (!name && !normPhone && !purpose && !address) continue;

      const rawVisitorId = r.visitor_id || r["Visitor ID"] || r["अ.क्र."] || r["अ.क्र"] || r["Sr No"] || null;
      const visitorId = rawVisitorId ? String(rawVisitorId).trim() : null;

      // Detect sub-category
      let rowSubCategory = r.sub_category || targetSubCategory || null;
      if (!rowSubCategory) {
        const rowGender = String(r.gender || r["लिंग"] || r["पुरुष/महिला"] || "").trim().toLowerCase();
        if (rowGender.includes("पुरुष") || rowGender.includes("male")) rowSubCategory = "Male";
        else if (rowGender.includes("महिला") || rowGender.includes("female")) rowSubCategory = "Female";
      }

      const subKey = rowSubCategory ? rowSubCategory.toLowerCase() : "";
      const vidKey = visitorId ? `${subKey}::${visitorId}` : "";

      // Duplicate check: phone (if valid 10-digit) or visitorId scoped by subcategory
      const isPhoneDuplicate = normPhone && normPhone.length === 10 && (existingPhones.has(normPhone) || seenInBatchPhones.has(normPhone));
      const isVidDuplicate = vidKey && (existingVisitorIds.has(vidKey) || seenInBatchVisitorIds.has(vidKey));

      if (isPhoneDuplicate || isVidDuplicate) {
        duplicateCount++;
        continue;
      }

      // Mark seen
      if (normPhone && normPhone.length === 10) seenInBatchPhones.add(normPhone);
      if (vidKey) seenInBatchVisitorIds.add(vidKey);

      const rawDob = r.dob || r["DOB"] || r["Date of Birth"] || null;
      const { dob, dob_day, dob_month } = parseDob(rawDob);
      const visitDate = r.visit_date || r["Visit Date"] || null;
      const referenceBy = r.reference_by || r["Reference By"] || null;
      // Blank phone no when not provided
      const finalPhone = (normPhone && normPhone.length === 10)
        ? normPhone
        : (rawPhone && rawPhone !== "N/A" && rawPhone !== "null" && rawPhone !== "undefined" ? rawPhone : "");

      const remarks = (
        r.remarks ||
        r["Remarks"] ||
        r.excel_remarks ||
        r["शेरा"] ||
        (rawPhone.includes("/") ? `अतिरिक्त संपर्क: ${rawPhone}` : null) ||
        null
      );

      // Map Excel Remark to initial call status
      const initialStatus = mapRemarkToStatus(remarks, targetCategory);

      rowsToInsert.push([
        targetCategory,
        rowSubCategory,
        visitorId,
        name || "Unknown Visitor",
        finalPhone, // Blank phone no when missing
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
          category, sub_category, visitor_id, name, phone, dob, dob_day, dob_month,
          visit_date, reference_by, purpose, address, excel_remarks,
          assigned_to, call_status
        ) VALUES ?
      `;
      await queryPromise(sql, [chunk]);
      inserted += chunk.length;
    }

    res.status(201).json({
      message: `Successfully imported ${inserted} new leads into "${targetCategory}"${targetSubCategory ? ` (${targetSubCategory})` : ""}. (${duplicateCount} duplicates skipped)`,
      insertedCount: inserted,
      duplicateCount,
      totalProcessed: rows.length
    });
  } catch (err) {
    console.error("Error in uploadLeads:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET CALL LOGS FOR A SPECIFIC LEAD
exports.getLeadCallLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT 
        l.*,
        a.username as caller_username,
        a.name as caller_name
      FROM call_logs l
      LEFT JOIN admins a ON l.caller_id = a.id
      WHERE l.lead_id = ?
      ORDER BY l.created_at DESC
    `;
    const logs = await queryPromise(sql, [id]);
    res.json({ logs });
  } catch (err) {
    console.error("Error in getLeadCallLogs:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET ALL CALL LOGS (Paginated audit trail)
exports.getAllCallLogs = async (req, res) => {
  try {
    const { caller_id, call_status, category, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    const isCaller = req.user && (req.user.role === "employee" || req.user.role === "caller");
    if (isCaller) {
      conditions.push("l.caller_id = ?");
      params.push(req.user.id);
    } else if (caller_id && caller_id !== "all") {
      conditions.push("l.caller_id = ?");
      params.push(caller_id);
    }

    if (call_status && call_status !== "all") {
      conditions.push("l.call_status = ?");
      params.push(call_status);
    }

    if (category && category !== "all") {
      conditions.push("c.category = ?");
      params.push(category);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push("(c.name LIKE ? OR c.phone LIKE ? OR l.customer_number LIKE ? OR a.name LIKE ? OR a.username LIKE ? OR l.notes LIKE ?)");
      params.push(q, q, q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    const countRes = await queryPromise(`
      SELECT COUNT(*) as total 
      FROM call_logs l
      LEFT JOIN calling_leads c ON l.lead_id = c.id
      LEFT JOIN admins a ON l.caller_id = a.id
      ${whereClause}
    `, params);
    const total = countRes[0]?.total || 0;

    const dataSql = `
      SELECT 
        l.*,
        c.name as customer_name,
        c.category as lead_category,
        c.sub_category as lead_sub_category,
        c.phone as lead_phone,
        a.username as caller_username,
        a.name as caller_name
      FROM call_logs l
      LEFT JOIN calling_leads c ON l.lead_id = c.id
      LEFT JOIN admins a ON l.caller_id = a.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = await queryPromise(dataSql, [...params, limitNum, offset]);

    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error("Error in getAllCallLogs:", err);
    res.status(500).json({ error: err.message });
  }
};

// DELETE LEAD
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    await queryPromise("DELETE FROM call_logs WHERE lead_id = ?", [id]);
    const result = await queryPromise("DELETE FROM calling_leads WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json({ message: "Lead and associated call logs deleted successfully" });
  } catch (err) {
    console.error("Error deleting lead:", err);
    res.status(500).json({ error: err.message });
  }
};

// BULK DELETE LEADS
exports.bulkDeleteLeads = async (req, res) => {
  try {
    const { lead_ids } = req.body;
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ error: "No lead_ids provided" });
    }

    await queryPromise("DELETE FROM call_logs WHERE lead_id IN (?)", [lead_ids]);
    const result = await queryPromise("DELETE FROM calling_leads WHERE id IN (?)", [lead_ids]);

    res.json({
      message: `Successfully deleted ${result.affectedRows} leads.`,
      deletedCount: result.affectedRows
    });
  } catch (err) {
    console.error("Error in bulkDeleteLeads:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET CALLER DETAILS & CALLING STATS
exports.getCallerDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = parseInt(id, 10);

    const [adminRows, statsRows, categoryRows, recentCalls] = await Promise.all([
      queryPromise(
        "SELECT id, username, name, phone, '' as email, role, status, created_at FROM admins WHERE id = ?",
        [callerId]
      ),
      queryPromise(`
        SELECT 
          COUNT(*) as total_assigned,
          SUM(CASE WHEN call_status = 'pending' OR call_status IS NULL THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN call_status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN call_status != 'pending' AND call_status IS NOT NULL AND call_status != '' THEN 1 ELSE 0 END) as total_dialed,
          SUM(CASE WHEN call_status = 'birthday_wished' THEN 1 ELSE 0 END) as birthday_wished,
          SUM(CASE WHEN call_status = 'called' THEN 1 ELSE 0 END) as called,
          SUM(CASE WHEN call_status = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable,
          SUM(CASE WHEN call_status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_number,
          SUM(CASE WHEN call_status = 'callback' THEN 1 ELSE 0 END) as callback,
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
