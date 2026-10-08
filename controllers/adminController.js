const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

// LOGIN
exports.login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  db.query(
    "SELECT * FROM admins WHERE username=?",
    [username],
    async (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.length > 0) {
        const user = result[0];
        
        // Check account active status
        if (user.status && user.status === "inactive") {
          return res.status(403).json({ message: "Account is inactive. Please contact administrator." });
        }

        // Check if stored password is a bcrypt hash
        const isBcrypt = user.password && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$") || user.password.startsWith("$2y$"));
        let isMatch = false;

        try {
          if (isBcrypt) {
            isMatch = await bcrypt.compare(password, user.password);
          } else {
            isMatch = (password === user.password);
          }
        } catch (compareErr) {
          return res.status(500).json({ message: "Error verifying password" });
        }

        if (isMatch) {
          // Generate JWT token including role & name
          const userRole = user.role || "admin";
          const token = jwt.sign(
            { 
              id: user.id, 
              username: user.username,
              role: userRole,
              name: user.name || user.username
            },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "7d" }
          );
          res.json({ 
            message: "Login success", 
            user: { 
              id: user.id, 
              username: user.username, 
              role: userRole,
              name: user.name || "",
              phone: user.phone || "",
              status: user.status || "active"
            }, 
            token 
          });
        } else {
          res.status(401).json({ message: "Invalid username or password" });
        }
      } else {
        res.status(401).json({ message: "Invalid username or password" });
      }
    }
  );
};

// CREATE ADMIN / EMPLOYEE USER
exports.createAdmin = async (req, res) => {
  const { username, password, role = "employee", name = "", phone = "", status = "active" } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    // Check if username already exists
    db.query("SELECT id FROM admins WHERE username = ?", [username], async (checkErr, checkResult) => {
      if (checkErr) return res.status(500).json({ error: checkErr.message });
      if (checkResult.length > 0) {
        return res.status(400).json({ message: "Username already exists. Please choose a different username." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      db.query(
        "INSERT INTO admins (username, password, role, name, phone, status) VALUES (?, ?, ?, ?, ?, ?)",
        [username.trim(), hashedPassword, role, name ? name.trim() : null, phone ? phone.trim() : null, status || "active"],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          const roleLabel = role === "admin" ? "Admin" : "Employee";
          res.status(201).json({ 
            message: roleLabel + " created successfully", 
            userId: result.insertId 
          });
        }
      );
    });
  } catch (hashErr) {
    return res.status(500).json({ message: "Error encrypting password" });
  }
};

// GET ALL ADMINS / USERS (with optional role filter)
exports.getAllAdmins = (req, res) => {
  const { role, status } = req.query;
  let sql = "SELECT id, username, role, name, phone, status, created_at FROM admins";
  const params = [];
  const conditions = [];

  if (role) {
    conditions.push("role = ?");
    params.push(role);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY id DESC";

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
};

// UPDATE USER (Admin / Employee)
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, phone, role, status, password } = req.body;

  try {
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name ? name.trim() : null);
    }
    if (phone !== undefined) {
      updates.push("phone = ?");
      params.push(phone ? phone.trim() : null);
    }
    if (role !== undefined) {
      updates.push("role = ?");
      params.push(role);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push("password = ?");
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    params.push(id);
    const sql = "UPDATE admins SET " + updates.join(", ") + " WHERE id = ?";

    db.query(sql, params, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User updated successfully" });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE USER
exports.deleteUser = (req, res) => {
  const { id } = req.params;

  // Prevent deleting current logged in admin
  if (req.user && req.user.id == id) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  db.query("DELETE FROM admins WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  });
};

// GET CALLING STATS
exports.getCallingStats = async (req, res) => {
  const queryPromise = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };

  try {
    const [total, pending, called, notReachable, resolved, inProgress, totalCallers] = await Promise.all([
      queryPromise("SELECT COUNT(*) as count FROM contact_messages"),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages WHERE call_status = 'pending' OR call_status IS NULL"),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages WHERE call_status = 'called'"),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages WHERE call_status = 'not_reachable'"),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages WHERE call_status = 'resolved'"),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages WHERE call_status = 'in_progress'"),
      queryPromise("SELECT COUNT(*) as count FROM admins WHERE role = 'employee' OR role = 'caller'")
    ]);

    res.json({
      total: total[0]?.count || 0,
      pending: pending[0]?.count || 0,
      called: called[0]?.count || 0,
      not_reachable: notReachable[0]?.count || 0,
      resolved: resolved[0]?.count || 0,
      in_progress: inProgress[0]?.count || 0,
      callers: totalCallers[0]?.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET STATS
exports.getStats = async (req, res) => {
  const queryPromise = (sql) => {
    return new Promise((resolve, reject) => {
      db.query(sql, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };

  try {
    const [newsCount, blogsCount, adminsCount, imagesCount, contactCount, pendingCallsCount] = await Promise.all([
      queryPromise("SELECT COUNT(*) as count FROM news"),
      queryPromise("SELECT COUNT(*) as count FROM blogs"),
      queryPromise("SELECT COUNT(*) as count FROM admins"),
      queryPromise("SELECT COUNT(*) as count FROM images").catch(() => [{ count: 0 }]),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages").catch(() => [{ count: 0 }]),
      queryPromise("SELECT COUNT(*) as count FROM contact_messages WHERE call_status = 'pending' OR call_status IS NULL").catch(() => [{ count: 0 }])
    ]);

    res.json({
      news: newsCount[0].count,
      blogs: blogsCount[0].count,
      admins: adminsCount[0].count,
      images: imagesCount[0].count,
      contacts: contactCount[0].count,
      pending_calls: pendingCallsCount[0].count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET LATEST DATA (latest 5 news, blogs, admins) – with language translation
exports.getLatestData = async (req, res) => {
  const queryPromise = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };

  try {
    const [latestNews, latestBlogs, latestAdmins] = await Promise.all([
      queryPromise("SELECT id, category, title, description, LENGTH(image) > 0 as has_image, created_at, news_date FROM news ORDER BY id DESC LIMIT 5"),
      queryPromise("SELECT id, title, slug, LENGTH(image) > 0 as has_image, author, status, published_at, created_at, updated_at FROM blogs ORDER BY id DESC LIMIT 5"),
      queryPromise("SELECT id, username, role, name, status FROM admins ORDER BY id DESC LIMIT 5")
    ]);

    latestNews.forEach(item => {
      item.image = item.has_image ? "/api/media/news/" + item.id + "/image" : null;
      delete item.has_image;
    });

    latestBlogs.forEach(item => {
      item.image = item.has_image ? "/api/media/blogs/" + item.id + "/image" : null;
      delete item.has_image;
    });

    const targetLang = getTargetLanguage(req);

    const translatedNews = targetLang
      ? await Promise.all(
          latestNews.map(async (item) => {
            try {
              const [title, category, description] = await Promise.all([
                translateText(item.title, targetLang),
                translateText(item.category, targetLang),
                translateText(item.description, targetLang)
              ]);
              return { ...item, title, category, description };
            } catch {
              return item;
            }
          })
        )
      : latestNews;

    const translatedBlogs = targetLang
      ? await Promise.all(
          latestBlogs.map(async (item) => {
            try {
              const title = await translateText(item.title, targetLang);
              return { ...item, title };
            } catch {
              return item;
            }
          })
        )
      : latestBlogs;

    res.json({
      news: translatedNews,
      blogs: translatedBlogs,
      admins: latestAdmins
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL NEWS CATEGORIES
exports.getAllNewsCategories = (req, res) => {
  db.query(
    "SELECT DISTINCT category FROM news WHERE category IS NOT NULL AND TRIM(category) != '' ORDER BY category ASC",
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result.map(row => row.category));
    }
  );
};
