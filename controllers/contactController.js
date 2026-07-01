const db = require("../db");

// CREATE contact message (Public)
exports.createContact = (req, res) => {
  const { name, phone_number, email, subject, message } = req.body;

  if (!name || !phone_number || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields (name, phone_number, email, subject, message) are required" });
  }

  db.query(
    "INSERT INTO contact_messages (name, phone_number, email, subject, message) VALUES (?, ?, ?, ?, ?)",
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

// GET all contact messages (Admin only)
exports.getAllContacts = (req, res) => {
  const { is_read } = req.query;
  let sql = "SELECT * FROM contact_messages";
  const params = [];

  if (is_read !== undefined) {
    sql += " WHERE is_read = ?";
    params.push(is_read === "true" || is_read === "1" ? 1 : 0);
  }

  sql += " ORDER BY id DESC";

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
};

// MARK contact message as read (Admin only)
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
