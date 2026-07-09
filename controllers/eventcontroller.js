const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

async function translateEventItem(item, targetLang) {
  if (!targetLang) return item;
  try {
    const [translatedTitle, translatedDescription] = await Promise.all([
      item.title ? translateText(item.title, targetLang) : Promise.resolve(item.title),
      item.description ? translateText(item.description, targetLang) : Promise.resolve(item.description)
    ]);
    return {
      ...item,
      title: translatedTitle,
      description: translatedDescription
    };
  } catch (err) {
    console.error("Error in translateEventItem:", err.message);
    return item;
  }
}

// GET ALL EVENTS
exports.getAllEvents = (req, res) => {
  db.query("SELECT * FROM event ORDER BY id DESC", async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translatedResult = await Promise.all(
          result.map(item => translateEventItem(item, targetLang))
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
exports.getEventById = (req, res) => {
  db.query("SELECT * FROM event WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.length === 0) return res.json(result);
    
    const targetLang = getTargetLanguage(req);
    if (targetLang) {
      try {
        const translatedItem = await translateEventItem(result[0], targetLang);
        return res.json([translatedItem]);
      } catch (transErr) {
        console.error("Error in single translation:", transErr.message);
      }
    }
    
    res.json(result);
  });
};

// INSERT EVENT
exports.createEvent = (req, res) => {
  const { title, description, main_image, images } = req.body;
  
  const imagesStr = Array.isArray(images) ? JSON.stringify(images) : JSON.stringify([]);

  db.query(
    "INSERT INTO event (title, description, main_image, images) VALUES (?,?,?,?)",
    [title, description, main_image, imagesStr],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Event added", result });
    }
  );
};

// UPDATE EVENT
exports.updateEvent = (req, res) => {
  const { title, description, main_image, images } = req.body;
  
  const imagesStr = Array.isArray(images) ? JSON.stringify(images) : JSON.stringify([]);

  db.query(
    "UPDATE event SET title=?, description=?, main_image=?, images=? WHERE id=?",
    [title, description, main_image, imagesStr, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Updated" });
    }
  );
};

// DELETE EVENT
const { deleteImageFromCloudinary } = require("../utils/cloudinary");

exports.deleteEvent = (req, res) => {
  const eventId = req.params.id;
  
  // Get the event to find its images
  db.query("SELECT main_image, images FROM event WHERE id=?", [eventId], (selectErr, selectResult) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    
    // Proceed to delete the record
    db.query("DELETE FROM event WHERE id=?", [eventId], async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // If we found the image, delete it from Cloudinary
      if (selectResult.length > 0) {
        if (selectResult[0].main_image) {
          try {
            await deleteImageFromCloudinary(selectResult[0].main_image);
          } catch(e) {
            console.error(e);
          }
        }
        if (selectResult[0].images) {
          try {
            const imagesArray = typeof selectResult[0].images === 'string' ? JSON.parse(selectResult[0].images) : selectResult[0].images;
            for (let img of imagesArray) {
              await deleteImageFromCloudinary(img);
            }
          } catch(e) {
            console.error(e);
          }
        }
      }
      
      res.json({ message: "Deleted" });
    });
  });
};
