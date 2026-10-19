const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

// LOGIN (Supports Username OR Phone Number)
exports.login = (req, res) => {
  const identifier = String(req.body.username || req.body.phone || req.body.identifier || "").trim();
  const { password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: "युझरनेम किंवा मोबाईल नंबर आणि पासवर्ड आवश्यक आहे (Username or phone and password are required)" });
  }

  const rawDigits = identifier.replace(/\D/g, "");
  const phone10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

  // Query all candidate users matching username OR phone number
  // Order active accounts before deleted accounts
  const sql = `
    SELECT * FROM admins 
    WHERE LOWER(TRIM(username)) = LOWER(?)
       OR TRIM(phone) = ?
       OR (? != '' AND (
            phone = ? 
            OR phone = ?
            OR phone = ?
            OR phone LIKE ?
            OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?
          ))
    ORDER BY (CASE WHEN (isDeleted = 1 OR isDelete = 1) THEN 1 ELSE 0 END) ASC, id DESC
  `;
  const params = [
    identifier,
    identifier,
    phone10,
    phone10,
    `+91${phone10}`,
    `0${phone10}`,
    `%${phone10}`,
    phone10
  ];

  db.query(sql, params, async (err, result) => {
    if (err) return res.status(500).json(err);

    if (!result || result.length === 0) {
      return res.status(401).json({ 
        message: "युझरनेम/मोबाईल नंबर किंवा पासवर्ड चुकीचा आहे. (Invalid username/phone or password)" 
      });
    }

    let matchedUser = null;
    let hadDeletedMatch = false;

    // Check each candidate account against the provided password
    // Correctly handles multiple users sharing a phone number or family accounts
    for (const candidate of result) {
      const isUserDeleted = (
        candidate.isDeleted == 1 ||
        candidate.isDelete == 1 ||
        candidate.isDeleted === true ||
        candidate.isDelete === true ||
        String(candidate.isDeleted) === "1" ||
        String(candidate.isDelete) === "1" ||
        String(candidate.isDeleted) === "true" ||
        String(candidate.isDelete) === "true"
      );

      // Verify password
      const isBcrypt = candidate.password && (candidate.password.startsWith("$2a$") || candidate.password.startsWith("$2b$") || candidate.password.startsWith("$2y$"));
      let isMatch = false;
      try {
        if (isBcrypt) {
          isMatch = await bcrypt.compare(password, candidate.password);
        } else {
          isMatch = (password === candidate.password);
        }
      } catch (compareErr) {
        // continue checking other candidates
      }

      if (isMatch) {
        if (isUserDeleted) {
          hadDeletedMatch = true;
          continue; // check other candidates in case an active one exists
        }
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      if (hadDeletedMatch) {
        return res.status(403).json({ 
          message: "हे खाते प्रशासकाद्वारे हटवले गेले आहे. आपण लॉगिन करू शकत नाही. कृपया प्रशासकाशी संपर्क साधा (Account has been deleted by administrator. You cannot log in.)" 
        });
      }
      return res.status(401).json({ 
        message: "युझरनेम/मोबाईल नंबर किंवा पासवर्ड चुकीचा आहे. (Invalid username/phone or password)" 
      });
    }

    const user = matchedUser;

    // Check account active status
    if (user.status && user.status === "inactive") {
      if (user.role === "employee" || user.role === "caller") {
        // Automatically reactivate calling employee on self-login only if not deleted
        db.query("UPDATE admins SET status = 'active' WHERE id = ?", [user.id]);
        user.status = "active";
      } else {
        return res.status(403).json({ message: "Account is inactive. Please contact administrator." });
      }
    }

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
      { expiresIn: "3650d" }
    );
    // Set auth_token in cookie
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("auth_token", token, {
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
      expires: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      httpOnly: false,
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      path: "/"
    });

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
  });
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
        "INSERT INTO admins (username, password, role, name, phone, status, isDelete, isDeleted) VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
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

// EMPLOYEE SIGNUP (Public registration for calling employees)
exports.employeeSignup = async (req, res) => {
  const { username, password, name = "", phone = "" } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  const cleanUsername = String(username).trim();
  const cleanName = name ? String(name).trim() : "";
  const cleanPhone = phone ? String(phone).trim() : "";

  if (cleanUsername.length < 3) {
    return res.status(400).json({ message: "युझरनेम किमान ३ अक्षरांचे असणे आवश्यक आहे (Username must be at least 3 characters)" });
  }

  if (String(password).length < 4) {
    return res.status(400).json({ message: "पासवर्ड किमान ४ अक्षरांचा असणे आवश्यक आहे (Password must be at least 4 characters)" });
  }

  try {
    // Check if username already exists in active accounts (case-insensitive)
    db.query(
      "SELECT id FROM admins WHERE LOWER(username) = LOWER(?) AND (isDelete = 0 OR isDelete IS NULL) AND (isDeleted = 0 OR isDeleted IS NULL)", 
      [cleanUsername], 
      async (checkErr, checkResult) => {
        if (checkErr) return res.status(500).json({ error: checkErr.message });
        if (checkResult && checkResult.length > 0) {
          return res.status(400).json({ message: "हे युझरनेम आधीच अस्तित्वात आहे. कृपया दुसरे युझरनेम निवडा (Username already exists. Please choose a different username.)" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = "employee";
        const userStatus = "active";

        db.query(
          "INSERT INTO admins (username, password, role, name, phone, status, isDelete, isDeleted) VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
          [cleanUsername, hashedPassword, userRole, cleanName || null, cleanPhone || null, userStatus],
          (insertErr, result) => {
          if (insertErr) return res.status(500).json({ error: insertErr.message });

          const newUserId = result.insertId;

          // Generate JWT token so the employee is logged in immediately
          const token = jwt.sign(
            { 
              id: newUserId, 
              username: cleanUsername,
              role: userRole,
              name: cleanName || cleanUsername
            },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "3650d" }
          );

          const isProduction = process.env.NODE_ENV === "production";
          res.cookie("auth_token", token, {
            maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
            expires: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
            httpOnly: false,
            sameSite: isProduction ? "none" : "lax",
            secure: isProduction,
            path: "/"
          });

          res.status(201).json({
            message: "कर्मचारी नोंदणी यशस्वी झाली! (Employee registered successfully)",
            token,
            user: {
              id: newUserId,
              username: cleanUsername,
              role: userRole,
              name: cleanName || "",
              phone: cleanPhone || "",
              status: userStatus
            }
          });
        }
      );
    });
  } catch (err) {
    return res.status(500).json({ message: "Registration error: " + err.message });
  }
};

// GET ALL ADMINS / USERS (with optional role filter)
exports.getAllAdmins = (req, res) => {
  const { role, status, isDelete, isDeleted, include_deleted } = req.query;
  let sql = "SELECT id, username, role, name, phone, status, isDelete, isDeleted, created_at FROM admins";
  const params = [];
  const conditions = [];

  const delFilter = isDeleted !== undefined ? isDeleted : isDelete;

  if (include_deleted === "true") {
    // include all records
  } else if (delFilter !== undefined) {
    const flag = (delFilter == "1" || delFilter === true || delFilter === "true") ? 1 : 0;
    conditions.push("(isDelete = ? OR isDeleted = ?)");
    params.push(flag, flag);
  } else {
    conditions.push("(isDelete = 0 OR isDelete IS NULL) AND (isDeleted = 0 OR isDeleted IS NULL)");
  }

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

    const delVal = req.body.isDeleted !== undefined ? req.body.isDeleted : req.body.isDelete;
    if (delVal !== undefined) {
      const isDel = (delVal === true || delVal === 1 || delVal === "1" || delVal === "true") ? 1 : 0;
      updates.push("isDelete = ?, isDeleted = ?");
      params.push(isDel, isDel);
      if (isDel === 1) {
        updates.push("status = 'inactive'");
      }
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

// DELETE USER (Soft delete using isDelete = 1 and isDeleted = 1)
exports.deleteUser = (req, res) => {
  const { id } = req.params;

  // Prevent deleting current logged in admin
  if (req.user && req.user.id == id) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  db.query(
    "UPDATE admins SET isDelete = 1, isDeleted = 1, status = 'inactive' WHERE id = ?",
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User deleted successfully" });
    }
  );
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
      queryPromise("SELECT COUNT(*) as count FROM admins WHERE (role = 'employee' OR role = 'caller') AND (isDelete = 0 OR isDelete IS NULL) AND (isDeleted = 0 OR isDeleted IS NULL)")
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
      queryPromise("SELECT COUNT(*) as count FROM admins WHERE (isDelete = 0 OR isDelete IS NULL) AND (isDeleted = 0 OR isDeleted IS NULL)"),
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
      queryPromise("SELECT id, username, role, name, status FROM admins WHERE (isDelete = 0 OR isDelete IS NULL) AND (isDeleted = 0 OR isDeleted IS NULL) ORDER BY id DESC LIMIT 5")
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


// GET CURRENT LOGGED IN USER (/me)
exports.getMe = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  db.query(
    "SELECT id, username, role, name, phone, status, isDelete, isDeleted, created_at FROM admins WHERE id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      const user = result[0];
      const isDel = (
        user.isDeleted == 1 ||
        user.isDelete == 1 ||
        user.isDeleted === true ||
        user.isDelete === true ||
        String(user.isDeleted) === "1" ||
        String(user.isDelete) === "1" ||
        String(user.isDeleted) === "true" ||
        String(user.isDelete) === "true"
      );
      if (isDel) {
        return res.status(403).json({ 
          message: "हे खाते प्रशासकाद्वारे हटवले गेले आहे (Account has been deleted by administrator.)" 
        });
      }
      res.json({ user });
    }
  );
};

// LOGOUT (Clear cookie)
exports.logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("auth_token", {
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction
  });
  res.json({ message: "Logged out successfully" });
};


// UPDATE OWN STATUS (Activate or Inactivate himself)
exports.updateMyStatus = (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { status } = req.body || {};
  const targetStatus = status ? String(status).toLowerCase().trim() : null;

  if (targetStatus && targetStatus !== "active" && targetStatus !== "inactive") {
    return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
  }

  // Check if user is deleted first
  db.query(
    "SELECT status, isDelete, isDeleted FROM admins WHERE id = ?",
    [req.user.id],
    (checkErr, rows) => {
      if (checkErr) return res.status(500).json({ error: checkErr.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: "User not found" });
      const cur = rows[0];
      if (cur.isDelete == 1 || cur.isDeleted == 1) {
        return res.status(403).json({ message: "हे खाते प्रशासकाद्वारे हटवले गेले आहे (Account has been deleted by administrator.)" });
      }

      if (targetStatus) {
        db.query(
          "UPDATE admins SET status = ? WHERE id = ?",
          [targetStatus, req.user.id],
          (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (result.affectedRows === 0) {
              return res.status(404).json({ message: "User not found" });
            }
            res.json({
              message: `Status updated to ${targetStatus}`,
              status: targetStatus,
              userId: req.user.id
            });
          }
        );
      } else {
        // Toggle current status
        const current = cur.status || "active";
        const toggled = current === "active" ? "inactive" : "active";

        db.query(
          "UPDATE admins SET status = ? WHERE id = ?",
          [toggled, req.user.id],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({
              message: `Status updated to ${toggled}`,
              status: toggled,
              userId: req.user.id
            });
          }
        );
      }
    }
  );
};

// UPDATE OWN PROFILE (Name, Calling Phone, Status & Password)
exports.updateMyProfile = (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { name, phone, status, currentPassword, password } = req.body || {};

  db.query("SELECT * FROM admins WHERE id = ?", [req.user.id], async (fetchErr, rows) => {
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!rows || rows.length === 0) return res.status(404).json({ message: "User not found" });

    const currentUser = rows[0];
    if (currentUser.isDelete == 1 || currentUser.isDeleted == 1) {
      return res.status(403).json({ message: "हे खाते प्रशासकाद्वारे हटवले गेले आहे (Account has been deleted by administrator.)" });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name ? String(name).trim() : null);
    }

    if (phone !== undefined) {
      updates.push("phone = ?");
      params.push(phone ? String(phone).trim() : null);
    }

    if (status !== undefined) {
      const cleanStatus = String(status).toLowerCase().trim();
      if (cleanStatus === "active" || cleanStatus === "inactive") {
        updates.push("status = ?");
        params.push(cleanStatus);
      }
    }

    if (password && String(password).trim() !== "") {
      const newPass = String(password).trim();
      if (newPass.length < 4) {
        return res.status(400).json({ message: "नवीन पासवर्ड किमान ४ अक्षरांचा असणे आवश्यक आहे (New password must be at least 4 characters)" });
      }

      // If current password is provided, verify it
      if (currentPassword) {
        const isBcrypt = currentUser.password && (currentUser.password.startsWith("$2a$") || currentUser.password.startsWith("$2b$") || currentUser.password.startsWith("$2y$"));
        let isMatch = false;
        try {
          if (isBcrypt) {
            isMatch = await bcrypt.compare(currentPassword, currentUser.password);
          } else {
            isMatch = (currentPassword === currentUser.password);
          }
        } catch (e) {
          return res.status(500).json({ message: "Error verifying password" });
        }

        if (!isMatch) {
          return res.status(400).json({ message: "सध्याचा पासवर्ड चुकीचा आहे (Current password is incorrect)" });
        }
      }

      const hashedPassword = await bcrypt.hash(newPass, 10);
      updates.push("password = ?");
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "कोणतीही माहिती अद्यतनित करण्यासाठी दिली नाही" });
    }

    params.push(req.user.id);
    const sql = "UPDATE admins SET " + updates.join(", ") + " WHERE id = ?";

    db.query(sql, params, (updateErr, result) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      
      // Fetch updated user
      db.query(
        "SELECT id, username, role, name, phone, status, created_at FROM admins WHERE id = ?",
        [req.user.id],
        (reFetchErr, userResult) => {
          if (reFetchErr || userResult.length === 0) {
            return res.json({ message: "प्रोफाईल यशस्वीरित्या अद्यतनित केले" });
          }
          res.json({
            message: "प्रोफाईल यशस्वीरित्या अद्यतनित केले (Profile updated successfully)",
            user: userResult[0]
          });
        }
      );
    });
  });
};

