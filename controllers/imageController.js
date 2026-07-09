const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

async function translateImageItem(item, targetLang) {
  if (!targetLang || !item.title) return item;
  try {
    const translatedTitle = await translateText(item.title, targetLang);
    return {
      ...item,
      title: translatedTitle
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

  let queryStr = "SELECT * FROM images";
  let countQueryStr = "SELECT COUNT(*) as total FROM images";
  let queryParams = [];
  
  if (search) {
    queryStr += " WHERE title LIKE ?";
    countQueryStr += " WHERE title LIKE ?";
    queryParams.push(`%${search}%`);
  }

  queryStr += " ORDER BY created_at DESC";

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
    db.query("SELECT * FROM images ORDER BY created_at DESC LIMIT 50", async (err, result) => {
      if (err) return res.status(500).json(err);
      
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
  db.query("SELECT * FROM images WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json(err);
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
  const { image, isHeroSelectionImage, title, category } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Image path/URL is required" });
  }

  db.query(
    "INSERT INTO images (image, isHeroSelectionImage, title, category) VALUES (?,?,?,?)",
    [image, isHeroSelectionImage ? 1 : 0, title || null, category || null],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Image added successfully", result });
    }
  );
};

// UPDATE IMAGE
exports.updateImage = (req, res) => {
  const { image, isHeroSelectionImage, title, category } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Image path/URL is required" });
  }

  db.query(
    "UPDATE images SET image=?, isHeroSelectionImage=?, title=?, category=? WHERE id=?",
    [image, isHeroSelectionImage ? 1 : 0, title || null, category || null, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Image not found" });
      }
      res.json({ message: "Image updated successfully" });
    }
  );
};

// DELETE IMAGE
const { deleteImageFromCloudinary } = require("../utils/cloudinary");

exports.deleteImage = (req, res) => {
  const imageId = req.params.id;

  db.query("SELECT image FROM images WHERE id=?", [imageId], (selectErr, selectResult) => {
    if (selectErr) return res.status(500).json(selectErr);

    db.query("DELETE FROM images WHERE id=?", [imageId], async (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      if (selectResult.length > 0 && selectResult[0].image) {
        await deleteImageFromCloudinary(selectResult[0].image);
      }

      res.json({ message: "Image deleted successfully" });
    });
  });
};

// GET HERO IMAGES (isHeroSelectionImage = 1, latest first)
exports.getHeroImages = (req, res) => {
  db.query(
    "SELECT * FROM images WHERE isHeroSelectionImage = 1 ORDER BY created_at DESC LIMIT 20",
    async (err, result) => {
      if (err) return res.status(500).json(err);

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

  let queryStr = "SELECT * FROM images WHERE category = ?";
  let countQueryStr = "SELECT COUNT(*) as total FROM images WHERE category = ?";
  let queryParams = [category];

  if (search) {
    queryStr += " AND title LIKE ?";
    countQueryStr += " AND title LIKE ?";
    queryParams.push(`%${search}%`);
  }

  queryStr += " ORDER BY created_at DESC";

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
      "SELECT * FROM images WHERE category = ? ORDER BY created_at DESC LIMIT 50",
      [category],
      async (err, result) => {
        if (err) return res.status(500).json(err);

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
      const categories = result.map(row => row.category);
      res.json(categories);
    }
  );
};

