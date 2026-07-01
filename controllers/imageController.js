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
  db.query("SELECT * FROM images ORDER BY created_at DESC LIMIT 20", async (err, result) => {
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
  const { image, isHeroSelectionImage, title } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Image path/URL is required" });
  }

  db.query(
    "INSERT INTO images (image, isHeroSelectionImage, title) VALUES (?,?,?)",
    [image, isHeroSelectionImage ? 1 : 0, title || null],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Image added successfully", result });
    }
  );
};

// UPDATE IMAGE
exports.updateImage = (req, res) => {
  const { image, isHeroSelectionImage, title } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Image path/URL is required" });
  }

  db.query(
    "UPDATE images SET image=?, isHeroSelectionImage=?, title=? WHERE id=?",
    [image, isHeroSelectionImage ? 1 : 0, title || null, req.params.id],
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

