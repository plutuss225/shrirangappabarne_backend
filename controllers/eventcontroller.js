const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");
const { base64ToBuffer, bufferToBase64 } = require("../utils/bufferUtils");

function formatItem(item) {
  if (item && item.id) {
    if (item.has_main_image) {
      item.main_image = `/api/media/event/${item.id}/main_image`;
    } else if (item.hasOwnProperty('has_main_image')) {
      item.main_image = null;
    }
    delete item.has_main_image;
  }
  return item;
}


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
  db.query("SELECT id, title, description, created_at, images, LENGTH(main_image) > 0 as has_main_image FROM event ORDER BY id DESC", async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (Array.isArray(result)) result.forEach(formatItem);
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
  db.query("SELECT id, title, description, created_at, images, LENGTH(main_image) > 0 as has_main_image FROM event WHERE id = ?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (Array.isArray(result)) result.forEach(formatItem);
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
    [title, description, base64ToBuffer(main_image), imagesStr],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (Array.isArray(result)) result.forEach(formatItem);
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
    [title, description, base64ToBuffer(main_image), imagesStr, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Updated" });
    }
  );
};

// DELETE EVENT
exports.deleteEvent = (req, res) => {
  const eventId = req.params.id;
  
  db.query("DELETE FROM event WHERE id=?", [eventId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Deleted" });
  });
};
