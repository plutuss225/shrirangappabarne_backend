const db = require("../db");

// CREATE contact message (Public)
exports.createContact = (req, res) => {
  const { name, phone_number, email, subject, message } = req.body;

  if (!name || !phone_number || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields (name, phone_number, email, subject, message) are required" });
  }

  db.query(
    "INSERT INTO contact_messages (name, phone_number, email, subject, message, call_status) VALUES (?, ?, ?, ?, ?, 'pending')",
    [name, phone_number, email, subject, message],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        message: "Contact message sent successfully",
        id: result.insertId
      });
    }
  );
};

// GET all contact messages (Admin & Calling Employees)
exports.getAllContacts = (req, res) => {
  const { is_read, call_status, assigned_to, search } = req.query;
  let sql = "SELECT c.*, a.username AS assigned_username, a.name AS assigned_name FROM contact_messages c LEFT JOIN admins a ON c.assigned_to = a.id";
  const params = [];
  const conditions = [];

  if (is_read !== undefined) {
    conditions.push("c.is_read = ?");
    params.push(is_read === "true" || is_read === "1" ? 1 : 0);
  }

  if (call_status) {
    if (call_status === "pending") {
      conditions.push("(c.call_status = 'pending' OR c.call_status IS NULL OR c.call_status = '')");
    } else {
      conditions.push("c.call_status = ?");
      params.push(call_status);
    }
  }

  if (assigned_to) {
    conditions.push("c.assigned_to = ?");
    params.push(assigned_to);
  }

  if (search) {
    conditions.push("(c.name LIKE ? OR c.phone_number LIKE ? OR c.email LIKE ? OR c.subject LIKE ?)");
    const searchTerm = "%" + search + "%";
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY c.id DESC";

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
};

// UPDATE CALL STATUS & NOTES (For Calling Employees & Admin)
exports.updateCallStatus = (req, res) => {
  const { id } = req.params;
  const { call_status, call_notes, assigned_to } = req.body;

  if (!call_status) {
    return res.status(400).json({ error: "call_status is required" });
  }

  // Default assigned_to to currently authenticated caller if not provided
  const callerId = assigned_to !== undefined ? assigned_to : (req.user ? req.user.id : null);

  db.query(
    "UPDATE contact_messages SET call_status = ?, call_notes = ?, assigned_to = ?, called_at = NOW(), is_read = 1 WHERE id = ?",
    [call_status, call_notes !== undefined ? call_notes : null, callerId, id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contact message not found" });
      }
      res.json({ 
        message: "Call status updated successfully",
        call_status,
        call_notes,
        assigned_to: callerId
      });
    }
  );
};

// MARK contact message as read
exports.markAsRead = (req, res) => {
  const { id } = req.params;

  db.query(
    "UPDATE contact_messages SET is_read = 1 WHERE id = ?",
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contact message not found" });
      }
      res.json({ message: "Contact message marked as read" });
    }
  );
};

// DELETE contact message (Admin only)
exports.deleteContact = (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM contact_messages WHERE id = ?",
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contact message not found" });
      }
      res.json({ message: "Contact message deleted successfully" });
    }
  );
};
