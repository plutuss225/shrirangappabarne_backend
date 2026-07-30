const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");
const { base64ToBuffer, bufferToBase64 } = require("../utils/bufferUtils");
const { uploadMedia } = require("../utils/cloudinary");

function formatItem(item) {
  if (item && item.id) {
    if (item.has_image) {
      const url = item.image_url ? item.image_url.toString() : "";
      if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
        item.image = url;
      } else {
        item.image = `/api/media/news/${item.id}/image`;
      }
    } else if (item.hasOwnProperty('has_image')) {
      item.image = null;
    }
    
    if (item.has_video) {
      const url = item.video_url ? item.video_url.toString() : "";
      if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
        item.video = url;
        if (!item.image || item.image.startsWith('/api/')) item.image = url;
      } else {
        item.video = `/api/media/news/${item.id}/video`;
        item.image = item.video;
      }
    } else if (item.hasOwnProperty('has_video')) {
      item.video = null;
    }

    delete item.has_image;
    delete item.has_video;
    delete item.image_prefix;
    delete item.video_prefix;
    delete item.full_image_url;
    delete item.full_video_url;
    delete item.image_url;
    delete item.video_url;
  }
  return item;
}


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
      original_title: item.title,
      original_category: item.category,
      original_description: item.description,
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
exports.getAllNews = async (req, res) => {
  let { page, limit, search, category, startDate, endDate } = req.query;

  let searchEn = search;
  let searchMr = search;
  if (search) {
    try {
      [searchEn, searchMr] = await Promise.all([
        translateText(search, "en"),
        translateText(search, "mr")
      ]);
    } catch (e) {
      console.error("Error translating search term:", e.message);
    }
  }

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM news WHERE 1=1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchMr}%`, `%${searchMr}%`, `%${searchMr}%`);
  }

  if (startDate) {
    sql += " AND DATE(news_date) >= ?";
    params.push(startDate);
  }

  if (endDate) {
    sql += " AND DATE(news_date) <= ?";
    params.push(endDate);
  }

  sql += " ORDER BY COALESCE(news_date, created_at) DESC, id DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total FROM news WHERE 1=1";
    const countParams = [];

    if (category) {
      countSql += " AND category = ?";
      countParams.push(category);
    }

    if (search) {
      countSql += " AND (title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchMr}%`, `%${searchMr}%`, `%${searchMr}%`);
    }

    if (startDate) {
      countSql += " AND DATE(news_date) >= ?";
      countParams.push(startDate);
    }

    if (endDate) {
      countSql += " AND DATE(news_date) <= ?";
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

        if (Array.isArray(result)) result.forEach(formatItem);
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
    // Re-added LIMIT 20 because fetching all Base64 images breaks the frontend
    sql += " LIMIT 20";
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
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
  const currentId = req.params.id;
  db.query("SELECT id, title, category, description, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM news WHERE id=?", [currentId], async (err, result) => {
    if (err) return res.json(err);
    if (result.length === 0) return res.json(result);
    if (Array.isArray(result)) result.forEach(formatItem);
    
    const targetLang = getTargetLanguage(req);
    let item = result[0];
    
    if (targetLang) {
      try {
        item = await translateNewsItem(item, targetLang);
      } catch (transErr) {
        console.error("Error in single translation:", transErr.message);
      }
    }
    
    const pnSql = `
      (SELECT id, title, 'prev' as type FROM news WHERE id < ? ORDER BY id DESC LIMIT 1)
      UNION
      (SELECT id, title, 'next' as type FROM news WHERE id > ? ORDER BY id ASC LIMIT 1)
    `;
    
    db.query(pnSql, [currentId, currentId], async (pnErr, pnResult) => {
      if (!pnErr && pnResult && pnResult.length > 0) {
        let prev = null;
        let next = null;
        
        for (let row of pnResult) {
          let translatedRow = { id: row.id, title: row.title };
          if (targetLang) {
             translatedRow.title = await translateText(row.title, targetLang).catch(() => row.title);
          }
          if (row.type === 'prev') prev = translatedRow;
          if (row.type === 'next') next = translatedRow;
        }
        item.prev = prev;
        item.next = next;
      }
      
      res.json([item]);
    });
  });
};

// INSERT NEWS
exports.createNews = async (req, res) => {
  const { title, category, description, image, video, news_date } = req.body;

  let videoUrl = video;
  if (video && !video.startsWith('/api/') && !video.startsWith('http')) {
    videoUrl = await uploadMedia(video, 'video');
  }

  db.query(
    "INSERT INTO news (title, category, description, image, video, news_date) VALUES (?,?,?,?,?,?)",
    [title, category || 'News', description, base64ToBuffer(image), videoUrl ? Buffer.from(videoUrl, 'utf8') : null, news_date],
    (err, result) => {
      if (err) return res.json(err);
      if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "News added", result });
    }
  );
};

// UPDATE NEWS
exports.updateNews = async (req, res) => {
  const { title, category, description, image, video, news_date } = req.body;

  let sql = "UPDATE news SET title=?, category=?, description=?, news_date=?";
  let params = [title, category || 'News', description, news_date];

  if (image !== undefined && !(typeof image === 'string' && image.startsWith('/api/'))) {
    sql += ", image=?";
    params.push(base64ToBuffer(image));
  }
  
  if (video !== undefined && !(typeof video === 'string' && (video.startsWith('/api/') || video.startsWith('http')))) {
    let videoUrl = await uploadMedia(video, 'video');
    sql += ", video=?";
    params.push(videoUrl ? Buffer.from(videoUrl, 'utf8') : null);
  }

  sql += " WHERE id=?";
  params.push(req.params.id);

  db.query(sql, params, (err, result) => {
    if (err) return res.json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Updated" });
  });
};

// DELETE NEWS
exports.deleteNews = (req, res) => {
  const newsId = req.params.id;
  
  db.query("DELETE FROM news WHERE id=?", [newsId], (err, result) => {
    if (err) return res.status(500).json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Deleted" });
  });
};

// GET CATEGORIES (distinct from news table, simple format)
exports.getCategories = (req, res) => {
  let { page, limit } = req.query;

  const baseSql = `
    SELECT category FROM news 
    WHERE category IS NOT NULL AND TRIM(category) != '' 
    GROUP BY category 
    ORDER BY MAX(COALESCE(news_date, created_at)) DESC, MAX(id) DESC
  `;

  if (page && limit) {
    db.query(
      "SELECT COUNT(DISTINCT category) as total FROM news WHERE category IS NOT NULL AND TRIM(category) != ''",
      (countErr, countResult) => {
        if (countErr) return res.status(500).json({ error: countErr.message });
        const total = countResult[0].total;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        db.query(baseSql + " LIMIT ? OFFSET ?", [parseInt(limit), offset], async (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          if (Array.isArray(result)) result.forEach(formatItem);
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
              return res.json({ categories, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) });
            } catch (transErr) {
              console.error("Error translating categories:", transErr.message);
            }
          }
          const categories = originalCategories.map(c => ({ key: c, label: c }));
          res.json({ categories, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) });
        });
      }
    );
  } else {
    db.query(baseSql, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (Array.isArray(result)) result.forEach(formatItem);
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
    });
  }
};

// GET CATEGORIES WITH LATEST NEWS
exports.getCategoriesWithLatestNews = (req, res) => {
  let { page, limit } = req.query;

  const baseSql = `
    SELECT n1.id, n1.title, n1.category, n1.description, n1.news_date, n1.created_at, LENGTH(n1.image) > 0 as has_image, LENGTH(n1.video) > 0 as has_video, CASE WHEN LENGTH(n1.image) < 300 THEN CONVERT(n1.image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(n1.video) < 300 THEN CONVERT(n1.video, CHAR) ELSE NULL END as video_url
    FROM news n1
    LEFT JOIN news n2 
      ON n1.category = n2.category 
      AND (COALESCE(n1.news_date, n1.created_at) < COALESCE(n2.news_date, n2.created_at) 
           OR (COALESCE(n1.news_date, n1.created_at) = COALESCE(n2.news_date, n2.created_at) AND n1.id < n2.id))
    WHERE n2.id IS NULL 
      AND n1.category IS NOT NULL 
      AND TRIM(n1.category) != ''
    ORDER BY COALESCE(n1.news_date, n1.created_at) DESC, n1.id DESC
  `;

  if (page && limit) {
    db.query(
      "SELECT COUNT(DISTINCT category) as total FROM news WHERE category IS NOT NULL AND TRIM(category) != ''",
      (countErr, countResult) => {
        if (countErr) return res.status(500).json({ error: countErr.message });
        const total = countResult[0].total;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const sql = baseSql + " LIMIT ? OFFSET ?";

        db.query(sql, [parseInt(limit), offset], async (err, result) => {
          if (err) return res.status(500).json({ error: err.message });

          if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);

          if (targetLang) {
            try {
              const translatedItems = await Promise.all(
                result.map((item) => translateNewsItem(item, targetLang))
              );
              const categories = result.map((row, i) => ({
                key: row.category,
                label: translatedItems[i].category,
                latestNews: translatedItems[i]
              }));
              return res.json({
                categories,
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
              });
            } catch (transErr) {
              console.error("Error translating categories:", transErr.message);
            }
          }

          const categories = result.map(row => ({ 
            key: row.category, 
            label: row.category,
            latestNews: row
          }));
          res.json({
            categories,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
          });
        });
      }
    );
  } else {
    db.query(baseSql, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);

      if (targetLang) {
        try {
          const translatedItems = await Promise.all(
            result.map((item) => translateNewsItem(item, targetLang))
          );
          const categories = result.map((row, i) => ({
            key: row.category,
            label: translatedItems[i].category,
            latestNews: translatedItems[i]
          }));
          return res.json({ categories });
        } catch (transErr) {
          console.error("Error translating categories:", transErr.message);
        }
      }

      const categories = result.map(row => ({ 
        key: row.category, 
        label: row.category,
        latestNews: row
      }));
      res.json({ categories });
    });
  }
};

// GET ALL NEWS BY CATEGORY (filtered, latest first)
// Usage: GET /news/by-category?category=Sports&search=test&page=1&limit=10
// If no category provided, returns all news ordered latest first
exports.getNewsByCategory = async (req, res) => {
  let { category, search, page, limit } = req.query;

  let searchEn = search;
  let searchMr = search;
  if (search) {
    try {
      [searchEn, searchMr] = await Promise.all([
        translateText(search, "en"),
        translateText(search, "mr")
      ]);
    } catch (e) {
      console.error("Error translating search term:", e.message);
    }
  }

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM news WHERE 1=1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchMr}%`, `%${searchMr}%`, `%${searchMr}%`);
  }

  sql += " ORDER BY COALESCE(news_date, created_at) DESC, id DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total FROM news WHERE 1=1";
    const countParams = [];
    if (category) {
      countSql += " AND category = ?";
      countParams.push(category);
    }
    if (search) {
      countSql += " AND (title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ? OR title LIKE ? OR description LIKE ? OR category LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchMr}%`, `%${searchMr}%`, `%${searchMr}%`);
    }

    db.query(countSql, countParams, (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      const total = countResult[0].total;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += " LIMIT ? OFFSET ?";
      params.push(parseInt(limit), offset);

      db.query(sql, params, async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        if (Array.isArray(result)) result.forEach(formatItem);
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
    // Re-added LIMIT 20 because fetching all Base64 images breaks the frontend
    sql += " LIMIT 20";
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
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

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM news";
  const params = [];

  if (category) {
    sql += " WHERE category = ?";
    params.push(category);
  }

  sql += " ORDER BY COALESCE(news_date, created_at) DESC, id DESC LIMIT 3";

  db.query(sql, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (Array.isArray(result)) result.forEach(formatItem);
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

// GET LATEST 3 NEWS
exports.getLatestNews = (req, res) => {
  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM news ORDER BY COALESCE(news_date, created_at) DESC, id DESC LIMIT 3";

  db.query(sql, [], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translated = await Promise.all(
          result.map((item) => translateNewsItem(item, targetLang))
        );
        return res.json(translated);
      } catch (transErr) {
        console.error("Error translating latest news:", transErr.message);
      }
    }

    res.json(result);
  });
};
