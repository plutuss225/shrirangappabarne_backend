const db = require('../db');

exports.getMedia = (req, res) => {
  const { table, id, field } = req.params;
  console.log(`Media Request: table=${table}, id=${id}, field=${field}`);
  const allowedTables = ['news', 'development_work', 'event', 'images', 'blogs'];
  const allowedFields = ['image', 'video', 'main_image', 'slider_images'];
  
  if (!allowedTables.includes(table) || !allowedFields.includes(field)) {
    console.log(`Invalid request: table=${table}, field=${field}`);
    return res.status(400).send('Invalid request');
  }

  db.query(`SELECT ${field} FROM ${table} WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).send(err.message);
    if (!result || result.length === 0 || !result[0][field]) {
      return res.status(404).send('Not found');
    }
    
    const data = result[0][field];

    // If the stored value is a URL string (e.g. Cloudinary URL stored as TEXT), redirect to it
    if (typeof data === 'string') {
      if (data.startsWith('http')) {
        return res.redirect(302, data);
      }
    }

    // Check if it's a Buffer containing a URL string (old records stored as BLOB containing URL text)
    if (Buffer.isBuffer(data)) {
      const preview = data.subarray(0, 8).toString('ascii');
      if (preview.startsWith('http')) {
        const url = data.toString('utf8').trim();
        return res.redirect(302, url);
      }
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const { getMimeType } = require('../utils/bufferUtils');
    const type = getMimeType(buffer);
    
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    // For videos, add Accept-Ranges header to support seeking
    if (type.startsWith('video/')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    
    res.end(buffer);
  });
};

