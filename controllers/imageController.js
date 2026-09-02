const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");
const { base64ToBuffer, bufferToBase64 } = require("../utils/bufferUtils");

function formatItem(item) {
  if (item && item.id) {
    if (item.has_image) {
      item.image = `/api/media/images/${item.id}/image`;
    } else if (item.hasOwnProperty('has_image')) {
      item.image = null;
    }
    delete item.has_image;
  }
  return item;
}


async function translateImageItem(item, targetLang) {
  if (!targetLang) return item;
  try {
    const translatedTitle = item.title ? await translateText(item.title, targetLang) : item.title;
    const translatedDesc = item.description ? await translateText(item.description, targetLang) : item.description;
    return {
      ...item,
      title: translatedTitle,
      description: translatedDesc
    };
  } catch (err) {
    console.error("Error in translateImageItem:", err.message);
    return item;
  }
}

// GET ALL IMAGES
exports.getAllImages = (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || "";
  const isPaginated = !isNaN(page);

  let queryStr = "SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images";
  let countQueryStr = "SELECT COUNT(*) as total FROM images";
  let queryParams = [];
  
  if (search) {
    queryStr += " WHERE title LIKE ?";
    countQueryStr += " WHERE title LIKE ?";
    queryParams.push(`%${search}%`);
  }

  queryStr += " ORDER BY date DESC, created_at DESC";

  if (isPaginated) {
    const offset = (page - 1) * limit;
    queryStr += " LIMIT ? OFFSET ?";
    queryParams.push(limit, offset);

    db.query(countQueryStr, queryParams.slice(0, search ? 1 : 0), (countErr, countResult) => {
      if (countErr) return res.status(500).json(countErr);
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      db.query(queryStr, queryParams, async (err, result) => {
        if (err) return res.status(500).json(err);
        
        if (Array.isArray(result)) result.forEach(formatItem);
        const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            const translatedResult = await Promise.all(
              result.map(item => translateImageItem(item, targetLang))
            );
            return res.json({ data: translatedResult, totalPages, currentPage: page });
          } catch (transErr) {
            console.error("Error in parallel translation:", transErr.message);
          }
        }
        
        res.json({ data: result, totalPages, currentPage: page });
      });
    });
  } else {
    // Original behavior for backward compatibility
    db.query("SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images ORDER BY date DESC, created_at DESC LIMIT 50", async (err, result) => {
      if (err) return res.status(500).json(err);
      
      if (Array.isArray(result)) result.forEach(formatItem);
      const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translatedResult = await Promise.all(
            result.map(item => translateImageItem(item, targetLang))
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
exports.getImageById = (req, res) => {
  db.query("SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    if (result.length === 0) return res.status(404).json({ message: "Image not found" });
    
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translatedItem = await translateImageItem(result[0], targetLang);
        return res.json([translatedItem]);
      } catch (transErr) {
        console.error("Error in single translation:", transErr.message);
      }
    }
    
    res.json(result);
  });
};

// INSERT IMAGE
exports.createImage = (req, res) => {
  const { image, isHeroSelectionImage, title, description, category, date } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Image path/URL is required" });
  }

  db.query(
    "INSERT INTO images (image, isHeroSelectionImage, title, description, category, date) VALUES (?,?,?,?,?,?)",
    [base64ToBuffer(image), isHeroSelectionImage ? 1 : 0, title || null, description || null, category || null, date || null],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Image added successfully", result });
    }
  );
};

// UPDATE IMAGE
exports.updateImage = (req, res) => {
  const { image, isHeroSelectionImage, title, description, category, date } = req.body;

  let sql = "UPDATE images SET isHeroSelectionImage=?, title=?, description=?, category=?, date=?";
  let params = [isHeroSelectionImage ? 1 : 0, title || null, description || null, category || null, date || null];

  if (image !== undefined && !(typeof image === 'string' && image.startsWith('/api/'))) {
    sql += ", image=?";
    params.push(base64ToBuffer(image));
  }

  sql += " WHERE id=?";
  params.push(req.params.id);

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    res.json({ message: "Image updated successfully" });
  });
};

// DELETE IMAGE
exports.deleteImage = (req, res) => {
  const imageId = req.params.id;

  db.query("DELETE FROM images WHERE id=?", [imageId], (err, result) => {
    if (err) return res.status(500).json(err);
    if (Array.isArray(result)) result.forEach(formatItem);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    res.json({ message: "Image deleted successfully" });
  });
};

// GET HERO IMAGES (isHeroSelectionImage = 1, latest first)
exports.getHeroImages = (req, res) => {
  db.query(
    "SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images WHERE isHeroSelectionImage = 1 ORDER BY date DESC, created_at DESC LIMIT 20",
    async (err, result) => {
      if (err) return res.status(500).json(err);

      if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translatedResult = await Promise.all(
            result.map((item) => translateImageItem(item, targetLang))
          );
          return res.json(translatedResult);
        } catch (transErr) {
          console.error("Error translating hero images:", transErr.message);
        }
      }

      res.json(result);
    }
  );
};

// GET IMAGES BY CATEGORY
exports.getImagesByCategory = (req, res) => {
  const { category } = req.params;
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || "";
  const isPaginated = !isNaN(page);

  let queryStr = "SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images WHERE category = ?";
  let countQueryStr = "SELECT COUNT(*) as total FROM images WHERE category = ?";
  let queryParams = [category];

  if (search) {
    queryStr += " AND title LIKE ?";
    countQueryStr += " AND title LIKE ?";
    queryParams.push(`%${search}%`);
  }

  queryStr += " ORDER BY date DESC, created_at DESC";

  if (isPaginated) {
    const offset = (page - 1) * limit;
    queryStr += " LIMIT ? OFFSET ?";
    queryParams.push(limit, offset);

    db.query(countQueryStr, queryParams.slice(0, search ? 2 : 1), (countErr, countResult) => {
      if (countErr) return res.status(500).json(countErr);
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      db.query(queryStr, queryParams, async (err, result) => {
        if (err) return res.status(500).json(err);
        
        if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            const translatedResult = await Promise.all(
              result.map(item => translateImageItem(item, targetLang))
            );
            return res.json({ data: translatedResult, totalPages, currentPage: page });
          } catch (transErr) {
            console.error("Error translating category images:", transErr.message);
          }
        }
        
        res.json({ data: result, totalPages, currentPage: page });
      });
    });
  } else {
    // Original behavior
    db.query(
      "SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images WHERE category = ? ORDER BY date DESC, created_at DESC LIMIT 50",
      [category],
      async (err, result) => {
        if (err) return res.status(500).json(err);

        if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
        if (targetLang) {
          try {
            const translatedResult = await Promise.all(
              result.map((item) => translateImageItem(item, targetLang))
            );
            return res.json(translatedResult);
          } catch (transErr) {
            console.error("Error translating category images:", transErr.message);
          }
        }

        res.json(result);
      }
    );
  }
};

// GET ALL CATEGORIES
exports.getCategories = (req, res) => {
  db.query(
    "SELECT DISTINCT category FROM images WHERE category IS NOT NULL AND TRIM(category) != ''",
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (Array.isArray(result)) result.forEach(formatItem);
    const categories = result.map(row => row.category);
      res.json(categories);
    }
  );
};

// GET LATEST 6 IMAGES
exports.getLatestImages = (req, res) => {
  db.query(
    "SELECT id, title, description, category, date, isHeroSelectionImage, created_at, LENGTH(image) > 0 as has_image FROM images ORDER BY date DESC, created_at DESC LIMIT 6",
    async (err, result) => {
      if (err) return res.status(500).json(err);
      
      if (Array.isArray(result)) result.forEach(formatItem);
      const targetLang = getTargetLanguage(req);
      if (targetLang) {
        try {
          const translatedResult = await Promise.all(
            result.map((item) => translateImageItem(item, targetLang))
          );
          return res.json(translatedResult);
        } catch (transErr) {
          console.error("Error translating latest images:", transErr.message);
        }
      }
      
      res.json(result);
    }
  );
};
