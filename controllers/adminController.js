const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

// LOGIN (simple)
exports.login = (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM admins WHERE username=?",
    [username],
    async (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.length > 0) {
        const user = result[0];
        
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
          // Generate JWT token
          const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "1d" }
          );
          res.json({ message: "Login success", user: { id: user.id, username: user.username }, token });
        } else {
          res.status(401).json({ message: "Invalid login" });
        }
      } else {
        res.status(401).json({ message: "Invalid login" });
      }
    }
  );
};

// CREATE ADMIN
exports.createAdmin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      "INSERT INTO admins (username, password) VALUES (?, ?)",
      [username, hashedPassword],
      (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Admin created successfully", adminId: result.insertId });
      }
    );
  } catch (hashErr) {
    return res.status(500).json({ message: "Error encrypting password" });
  }
};

// GET ALL ADMINS
exports.getAllAdmins = (req, res) => {
  db.query("SELECT id, username FROM admins ORDER BY id DESC", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
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
    const [newsCount, blogsCount, adminsCount, imagesCount] = await Promise.all([
      queryPromise("SELECT COUNT(*) as count FROM news"),
      queryPromise("SELECT COUNT(*) as count FROM blogs"),
      queryPromise("SELECT COUNT(*) as count FROM admins"),
      queryPromise("SELECT COUNT(*) as count FROM images").catch(() => [{ count: 0 }])
    ]);

    res.json({
      news: newsCount[0].count,
      blogs: blogsCount[0].count,
      admins: adminsCount[0].count,
      images: imagesCount[0].count
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
      queryPromise("SELECT id, category, title, description, image, created_at, news_date FROM news ORDER BY id DESC LIMIT 5"),
      queryPromise("SELECT id, title, slug, image, author, status, published_at, created_at, updated_at FROM blogs ORDER BY id DESC LIMIT 5"),
      queryPromise("SELECT id, username FROM admins ORDER BY id DESC LIMIT 5")
    ]);

    const targetLang = getTargetLanguage(req);

    // Translate news fields if a target language was requested
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

    // Translate blog title field if a target language was requested
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
