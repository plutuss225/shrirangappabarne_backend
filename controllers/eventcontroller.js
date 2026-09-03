const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");
const { base64ToBuffer, bufferToBase64 } = require("../utils/bufferUtils");
const { uploadMedia } = require("../utils/cloudinary");

function formatItem(item) {
  if (item && item.id) {
    if (item.has_main_image) {
      const url = item.main_image_url ? item.main_image_url.toString() : "";
      if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
        item.main_image = url;
      } else {
        item.main_image = `/api/media/event/${item.id}/main_image`;
      }
    } else if (item.hasOwnProperty('has_main_image')) {
      item.main_image = null;
    }
    
    if (item.has_video) {
      const url = item.video_url ? item.video_url.toString() : "";
      if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
        item.video = url;
        if (!item.main_image || item.main_image.startsWith('/api/')) item.main_image = url;
      } else {
        item.video = `/api/media/event/${item.id}/video`;
        item.main_image = item.video;
      }
    } else if (item.hasOwnProperty('has_video')) {
      item.video = null;
    }

    delete item.has_main_image;
    delete item.main_image_url;
    delete item.has_video;
    delete item.video_url;
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
  db.query("SELECT id, title, description, created_at, LENGTH(main_image) > 0 as has_main_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(main_image) < 300 THEN CONVERT(main_image, CHAR) ELSE NULL END as main_image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url FROM event ORDER BY id DESC", async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    try {
      if (Array.isArray(result)) result.forEach(formatItem);
    } catch (formatErr) {
      console.error("Format error:", formatErr);
      return res.status(500).json({ error: "Data formatting error" });
    }

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
  db.query("SELECT id, title, description, created_at, LENGTH(main_image) > 0 as has_main_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(main_image) < 300 THEN CONVERT(main_image, CHAR) ELSE NULL END as main_image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url, images FROM event WHERE id = ?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    try {
      if (Array.isArray(result)) result.forEach(formatItem);
    } catch (formatErr) {
      console.error("Format error:", formatErr);
      return res.status(500).json({ error: "Data formatting error" });
    }
    
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
exports.createEvent = async (req, res) => {
  const { title, description, main_image, video, images } = req.body;
  
  const imagesStr = Array.isArray(images) ? JSON.stringify(images) : JSON.stringify([]);

  db.query(
    "INSERT INTO event (title, description, main_image, video, images) VALUES (?,?,?,?,?)",
    [title, description, base64ToBuffer(main_image), base64ToBuffer(video), imagesStr],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Event added", result });
    }
  );
};

// UPDATE EVENT
exports.updateEvent = async (req, res) => {
  const { title, description, main_image, video, images } = req.body;
  
  const imagesStr = Array.isArray(images) ? JSON.stringify(images) : JSON.stringify([]);

  let sql = "UPDATE event SET title=?, description=?, images=?";
  let params = [title, description, imagesStr];

  if (main_image !== undefined && !(typeof main_image === 'string' && main_image.startsWith('/api/'))) {
    sql += ", main_image=?";
    params.push(base64ToBuffer(main_image));
  }
  
  if (video !== undefined && !(typeof video === 'string' && (video.startsWith('/api/') || video.startsWith('http')))) {
    sql += ", video=?";
    params.push(base64ToBuffer(video));
  }

  sql += " WHERE id=?";
  params.push(req.params.id);

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (Array.isArray(result)) result.forEach(formatItem);
    res.json({ message: "Updated" });
  });
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
