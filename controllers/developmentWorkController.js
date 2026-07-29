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
        item.image = `/api/media/development_work/${item.id}/image`;
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
        item.video = `/api/media/development_work/${item.id}/video`;
        item.image = item.video;
      }
    } else if (item.hasOwnProperty('has_video')) {
      item.video = null;
    }

    delete item.has_image;
    delete item.has_video;
    delete item.image_url;
    delete item.video_url;
  }
  return item;
}


async function translateDevelopmentWorkItem(item, targetLang) {
  if (!targetLang) return item;
  try {
    const [title, category, description, place] = await Promise.all([
      translateText(item.title, targetLang),
      translateText(item.category, targetLang),
      translateText(item.description, targetLang),
      translateText(item.place, targetLang)
    ]);
    return {
      ...item,
      title,
      category,
      description,
      place
    };
  } catch (err) {
    console.error("Error in translateDevelopmentWorkItem:", err.message);
    return item;
  }
}

// GET ALL NEWS
exports.getAllDevelopmentWork = (req, res) => {
  const { page, limit, search, category, place, startDate, endDate } = req.query;

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, place, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM development_work WHERE 1=1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (place) {
    sql += " AND place = ?";
    params.push(place);
  }

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  if (startDate) {
    sql += " AND DATE(news_date) >= ?";
    params.push(startDate);
  }

  if (endDate) {
    sql += " AND DATE(news_date) <= ?";
    params.push(endDate);
  }

  sql += " ORDER BY id DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total FROM development_work WHERE 1=1";
    const countParams = [];

    if (category) {
      countSql += " AND category = ?";
      countParams.push(category);
    }

    if (place) {
      countSql += " AND place = ?";
      countParams.push(place);
    }

    if (search) {
      countSql += " AND (title LIKE ? OR description LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`);
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
              result.map((item) => translateDevelopmentWorkItem(item, targetLang))
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
    sql += " LIMIT 20";
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translatedResult = await Promise.all(
            result.map((item) => translateDevelopmentWorkItem(item, targetLang))
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
exports.getDevelopmentWorkById = (req, res) => {
  db.query("SELECT id, title, category, description, place, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM development_work WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    if (result.length === 0) return res.json(result);
    
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translatedItem = await translateDevelopmentWorkItem(result[0], targetLang);
        return res.json([translatedItem]);
      } catch (transErr) {
        console.error("Error in single translation:", transErr.message);
      }
    }
    
    res.json(result);
  });
};

// INSERT NEWS
exports.createDevelopmentWork = async (req, res) => {
  const { title, category, description, place, image, video, news_date } = req.body;

  let videoUrl = video;
  if (video && !video.startsWith('/api/') && !video.startsWith('http')) {
    videoUrl = await uploadMedia(video, 'video');
  }

  db.query(
    "INSERT INTO development_work (title, category, description, place, image, video, news_date) VALUES (?,?,?,?,?,?,?)",
    [title, category || 'DevelopmentWork', description, place, base64ToBuffer(image), videoUrl ? Buffer.from(videoUrl, 'utf8') : null, news_date],
    (err, result) => {
      if (err) return res.json(err);
      if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "DevelopmentWork added", result });
    }
  );
};

// UPDATE NEWS
exports.updateDevelopmentWork = async (req, res) => {
  const { title, category, description, place, image, video, news_date } = req.body;

  let sql = "UPDATE development_work SET title=?, category=?, description=?, place=?, news_date=?";
  let params = [title, category || 'DevelopmentWork', description, place, news_date];

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

exports.deleteDevelopmentWork = (req, res) => {
  const development_workId = req.params.id;
  
  db.query("DELETE FROM development_work WHERE id=?", [development_workId], (err, result) => {
    if (err) return res.status(500).json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Deleted" });
  });
};

// GET CATEGORIES (max 4 distinct from development_work table)
exports.getCategories = (req, res) => {
  db.query(
    "SELECT DISTINCT category FROM development_work WHERE category IS NOT NULL AND TRIM(category) != '' ORDER BY category ASC",
    async (err, result) => {
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
    }
  );
};

// GET ALL NEWS BY CATEGORY (filtered, latest first)
// Usage: GET /development_work/by-category?category=Sports&search=test&page=1&limit=10
// If no category provided, returns all development_work ordered latest first
exports.getDevelopmentWorkByCategory = (req, res) => {
  const { category, search, page, limit } = req.query;

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, place, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM development_work WHERE 1=1";
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
    let countSql = "SELECT COUNT(*) as total FROM development_work WHERE 1=1";
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

        if (Array.isArray(result)) result.forEach(formatItem);
    let finalResult = result;
        const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            finalResult = await Promise.all(
              result.map((item) => translateDevelopmentWorkItem(item, targetLang))
            );
          } catch (transErr) {
            console.error("Error translating development_work by category:", transErr.message);
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
    sql += " LIMIT 20";
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translated = await Promise.all(
            result.map((item) => translateDevelopmentWorkItem(item, targetLang))
          );
          return res.json(translated);
        } catch (transErr) {
          console.error("Error translating development_work by category:", transErr.message);
        }
      }

      res.json(result);
    });
  }
};

// GET TOP 3 NEWS BY CATEGORY (latest 3, useful for homepage sections)
// Usage: GET /development_work/by-category/top?category=Sports
// If no category provided, returns latest 3 across all categories
exports.getTopDevelopmentWorkByCategory = (req, res) => {
  const { category } = req.query;

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, place, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM development_work";
  const params = [];

  if (category) {
    sql += " WHERE category = ?";
    params.push(category);
  }

  sql += " ORDER BY id DESC LIMIT 3";

  db.query(sql, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translated = await Promise.all(
          result.map((item) => translateDevelopmentWorkItem(item, targetLang))
        );
        return res.json(translated);
      } catch (transErr) {
        console.error("Error translating top development_work by category:", transErr.message);
      }
    }

    res.json(result);
  });
};

// GET 1 DEVELOPMENT WORK PER YEAR (with image/video)
exports.getDevelopmentWorkByYear = (req, res) => {
  let sql = `
    SELECT dw.id, dw.title, dw.category, dw.description, dw.place, dw.news_date, dw.created_at, 
           LENGTH(dw.image) > 0 as has_image, LENGTH(dw.video) > 0 as has_video, 
           CASE WHEN LENGTH(dw.image) < 300 THEN CONVERT(dw.image, CHAR) ELSE NULL END as image_url, 
           CASE WHEN LENGTH(dw.video) < 300 THEN CONVERT(dw.video, CHAR) ELSE NULL END as video_url,
           YEAR(COALESCE(dw.news_date, dw.created_at)) as year
    FROM development_work dw
    INNER JOIN (
        SELECT MAX(id) as max_id, YEAR(COALESCE(news_date, created_at)) as grp_year
        FROM development_work
        WHERE LENGTH(image) > 0 OR LENGTH(video) > 0
        GROUP BY YEAR(COALESCE(news_date, created_at))
    ) grouped ON dw.id = grouped.max_id
    ORDER BY year DESC
  `;

  db.query(sql, [], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translated = await Promise.all(
          result.map((item) => translateDevelopmentWorkItem(item, targetLang))
        );
        return res.json(translated);
      } catch (transErr) {
        console.error("Error translating development_work by year:", transErr.message);
      }
    }

    res.json(result);
  });
};

// GET PLACES (distinct places from development_work table)
exports.getPlaces = (req, res) => {
  db.query(
    "SELECT DISTINCT place FROM development_work WHERE place IS NOT NULL AND TRIM(place) != '' ORDER BY place ASC",
    async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
      const targetLang = getTargetLanguage(req);
      const originalPlaces = result.map((r) => r.place);

      if (targetLang) {
        try {
          const translated = await Promise.all(
            originalPlaces.map((p) => translateText(p, targetLang))
          );
          const places = originalPlaces.map((p, i) => ({
            key: p,
            label: translated[i]
          }));
          return res.json({ places });
        } catch (transErr) {
          console.error("Error translating places:", transErr.message);
        }
      }

      const places = originalPlaces.map(p => ({ key: p, label: p }));
      res.json({ places });
    }
  );
};

// GET ALL DEVELOPMENT WORK BY PLACE (filtered, latest first)
// Usage: GET /development_work/by-place?place=Pune&search=test&page=1&limit=10
exports.getDevelopmentWorkByPlace = (req, res) => {
  const { place, search, page, limit } = req.query;

  let sql = "SELECT id, title, category, SUBSTRING(description, 1, 200) as description, place, news_date, created_at, LENGTH(image) > 0 as has_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM development_work WHERE 1=1";
  const params = [];

  if (place) {
    sql += " AND place = ?";
    params.push(place);
  }

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " ORDER BY id DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total FROM development_work WHERE 1=1";
    const countParams = [];
    if (place) {
      countSql += " AND place = ?";
      countParams.push(place);
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

        if (Array.isArray(result)) result.forEach(formatItem);
        let finalResult = result;
        const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            finalResult = await Promise.all(
              result.map((item) => translateDevelopmentWorkItem(item, targetLang))
            );
          } catch (transErr) {
            console.error("Error translating development_work by place:", transErr.message);
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
    sql += " LIMIT 20";
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
      const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translated = await Promise.all(
            result.map((item) => translateDevelopmentWorkItem(item, targetLang))
          );
          return res.json(translated);
        } catch (transErr) {
          console.error("Error translating development_work by place:", transErr.message);
        }
      }

      res.json(result);
    });
  }
};

