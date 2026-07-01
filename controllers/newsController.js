const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

async function translateNewsItem(item, targetLang) {
  if (!targetLang) return item;
  try {
    const [title, category, description] = await Promise.all([
      translateText(item.title, targetLang),
      translateText(item.category, targetLang),
      translateText(item.description, targetLang)
    ]);
    return {
      ...item,
      title,
      category,
      description
    };
  } catch (err) {
    console.error("Error in translateNewsItem:", err.message);
    return item;
  }
}

// GET ALL NEWS
exports.getAllNews = (req, res) => {
  const { page, limit, search, category, startDate, endDate } = req.query;

  let sql = "SELECT * FROM news WHERE 1=1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  if (startDate) {
    sql += " AND DATE(created_at) >= ?";
    params.push(startDate);
  }

  if (endDate) {
    sql += " AND DATE(created_at) <= ?";
    params.push(endDate);
  }

  sql += " ORDER BY id DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total FROM news WHERE 1=1";
    const countParams = [];

    if (category) {
      countSql += " AND category = ?";
      countParams.push(category);
    }

    if (search) {
      countSql += " AND (title LIKE ? OR description LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      countSql += " AND DATE(created_at) >= ?";
      countParams.push(startDate);
    }

    if (endDate) {
      countSql += " AND DATE(created_at) <= ?";
      countParams.push(endDate);
    }

    db.query(countSql, countParams, (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      const total = countResult[0].total;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += " LIMIT ? OFFSET ?";
      params.push(parseInt(limit), offset);

      db.query(sql, params, async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        let finalResult = result;
        const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            finalResult = await Promise.all(
              result.map((item) => translateNewsItem(item, targetLang))
            );
          } catch (transErr) {
            console.error("Error in parallel translation:", transErr.message);
          }
        }

        return res.json({
          data: finalResult,
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        });
      });
    });
  } else {
    // Backward compatible mode if no page/limit
    // Removed LIMIT 20 so it returns all data
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translatedResult = await Promise.all(
            result.map((item) => translateNewsItem(item, targetLang))
          );
          return res.json(translatedResult);
        } catch (transErr) {
          console.error("Error in parallel translation:", transErr.message);
        }
      }

      res.json(result);
    });
  }
};

// GET BY ID
exports.getNewsById = (req, res) => {
  db.query("SELECT * FROM news WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.json(err);
    if (result.length === 0) return res.json(result);
    
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translatedItem = await translateNewsItem(result[0], targetLang);
        return res.json([translatedItem]);
      } catch (transErr) {
        console.error("Error in single translation:", transErr.message);
      }
    }
    
    res.json(result);
  });
};

// INSERT NEWS
exports.createNews = (req, res) => {
  const { title, category, description, image, video, news_date } = req.body;

  db.query(
    "INSERT INTO news (title, category, description, image, video, news_date) VALUES (?,?,?,?,?,?)",
    [title, category || 'News', description, image, video, news_date],
    (err, result) => {
      if (err) return res.json(err);
      res.json({ message: "News added", result });
    }
  );
};

// UPDATE NEWS
exports.updateNews = (req, res) => {
  const { title, category, description, image, video, news_date } = req.body;

  db.query(
    "UPDATE news SET title=?, category=?, description=?, image=?, video=?, news_date=? WHERE id=?",
    [title, category || 'News', description, image, video, news_date, req.params.id],
    (err, result) => {
      if (err) return res.json(err);
      res.json({ message: "Updated" });
    }
  );
};

// DELETE NEWS
const { deleteImageFromCloudinary } = require("../utils/cloudinary");

exports.deleteNews = (req, res) => {
  const newsId = req.params.id;
  
  // First get the news item to find its image
  db.query("SELECT image FROM news WHERE id=?", [newsId], (selectErr, selectResult) => {
    if (selectErr) return res.status(500).json(selectErr);
    
    // Proceed to delete the record
    db.query("DELETE FROM news WHERE id=?", [newsId], async (err, result) => {
      if (err) return res.status(500).json(err);
      
      // If we found the image, delete it from Cloudinary
      if (selectResult.length > 0) {
        console.log("deleteNews -> Image URL from DB:", selectResult[0].image);
        if (selectResult[0].image) {
          await deleteImageFromCloudinary(selectResult[0].image);
        }
      } else {
        console.log("deleteNews -> No image found in DB for newsId:", newsId);
      }
      
      res.json({ message: "Deleted" });
    });
  });
};

// GET CATEGORIES (max 4 distinct from news table)
exports.getCategories = (req, res) => {
  db.query(
    "SELECT DISTINCT category FROM news WHERE category IS NOT NULL AND TRIM(category) != '' ORDER BY category ASC",
    async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const targetLang = getTargetLanguage(req);
      const originalCategories = result.map((r) => r.category);

      if (targetLang) {
        try {
          const translated = await Promise.all(
            originalCategories.map((c) => translateText(c, targetLang))
          );
          const categories = originalCategories.map((c, i) => ({
            key: c,
            label: translated[i]
          }));
          return res.json({ categories });
        } catch (transErr) {
          console.error("Error translating categories:", transErr.message);
        }
      }

      const categories = originalCategories.map(c => ({ key: c, label: c }));
      res.json({ categories });
    }
  );
};

// GET ALL NEWS BY CATEGORY (filtered, latest first)
// Usage: GET /news/by-category?category=Sports&search=test&page=1&limit=10
// If no category provided, returns all news ordered latest first
exports.getNewsByCategory = (req, res) => {
  const { category, search, page, limit } = req.query;

  let sql = "SELECT * FROM news WHERE 1=1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " ORDER BY id DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total FROM news WHERE 1=1";
    const countParams = [];
    if (category) {
      countSql += " AND category = ?";
      countParams.push(category);
    }
    if (search) {
      countSql += " AND (title LIKE ? OR description LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`);
    }

    db.query(countSql, countParams, (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      const total = countResult[0].total;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += " LIMIT ? OFFSET ?";
      params.push(parseInt(limit), offset);

      db.query(sql, params, async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        let finalResult = result;
        const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            finalResult = await Promise.all(
              result.map((item) => translateNewsItem(item, targetLang))
            );
          } catch (transErr) {
            console.error("Error translating news by category:", transErr.message);
          }
        }

        return res.json({
          data: finalResult,
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        });
      });
    });
  } else {
    // Backward compatible mode if no page/limit
    // Removed LIMIT 20 so it returns all data
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translated = await Promise.all(
            result.map((item) => translateNewsItem(item, targetLang))
          );
          return res.json(translated);
        } catch (transErr) {
          console.error("Error translating news by category:", transErr.message);
        }
      }

      res.json(result);
    });
  }
};

// GET TOP 3 NEWS BY CATEGORY (latest 3, useful for homepage sections)
// Usage: GET /news/by-category/top?category=Sports
// If no category provided, returns latest 3 across all categories
exports.getTopNewsByCategory = (req, res) => {
  const { category } = req.query;

  let sql = "SELECT * FROM news";
  const params = [];

  if (category) {
    sql += " WHERE category = ?";
    params.push(category);
  }

  sql += " ORDER BY id DESC LIMIT 3";

  db.query(sql, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translated = await Promise.all(
          result.map((item) => translateNewsItem(item, targetLang))
        );
        return res.json(translated);
      } catch (transErr) {
        console.error("Error translating top news by category:", transErr.message);
      }
    }

    res.json(result);
  });
};


