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

    if (item.images) {
      if (typeof item.images === 'string') {
        try {
          item.images = JSON.parse(item.images);
        } catch(e) {
          item.images = [];
        }
      }
    } else {
      item.images = [];
    }
  }
  return item;
}


// Translation removed per user request

// GET ALL EVENTS
exports.getAllEvents = (req, res) => {
  const { limit, page } = req.query;
  let sql = "SELECT id, title, description, created_at, LENGTH(main_image) > 0 as has_main_image, LENGTH(video) > 0 as has_video, CASE WHEN LENGTH(main_image) < 300 THEN CONVERT(main_image, CHAR) ELSE NULL END as main_image_url, CASE WHEN LENGTH(video) < 300 THEN CONVERT(video, CHAR) ELSE NULL END as video_url, images FROM event ORDER BY id DESC";
  const params = [];

  if (limit) {
    const limitNum = parseInt(limit);
    if (page) {
      const offset = (parseInt(page) - 1) * limitNum;
      sql += " LIMIT ? OFFSET ?";
      params.push(limitNum, offset);
    } else {
      sql += " LIMIT ?";
      params.push(limitNum);
    }
  }

  db.query(sql, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    try {
      if (Array.isArray(result)) result.forEach(formatItem);
    } catch (formatErr) {
      console.error("Format error:", formatErr);
      return res.status(500).json({ error: "Data formatting error" });
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
    
    res.json(result);
  });
};

// INSERT EVENT
exports.createEvent = async (req, res) => {
  const { title, description, main_image, video, images } = req.body;
  
  const imagesStr = Array.isArray(images) ? JSON.stringify(images) : JSON.stringify([]);

  let videoUrl = video;

  db.query(
    "INSERT INTO event (title, description, main_image, video, images) VALUES (?,?,?,?,?)",
    [title, description, base64ToBuffer(main_image), base64ToBuffer(videoUrl), imagesStr],
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
    let videoUrl = video;
    sql += ", video=?";
    params.push(base64ToBuffer(videoUrl));
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
