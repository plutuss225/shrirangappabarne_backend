const db = require('../db');
const { base64ToBuffer, getMimeType } = require('../utils/bufferUtils');

// Simple LRU Cache to avoid OOM on large videos during multiple Range requests
const mediaCache = new Map();
const MAX_CACHE_SIZE = 5; // keep max 5 media files in RAM

exports.getMedia = (req, res) => {
  const { table, id, field } = req.params;
  const allowedTables = ['news', 'development_work', 'event', 'images', 'blogs'];
  const allowedFields = ['image', 'video', 'main_image', 'slider_images'];
  
  if (!allowedTables.includes(table) || !allowedFields.includes(field)) {
    return res.status(400).send('Invalid request');
  }

  const cacheKey = `${table}_${field}_${id}`;

  const serveBuffer = (data) => {
    if (!data) return res.status(404).send('Not found');

    // If the stored value is a URL string (e.g. Cloudinary URL stored as TEXT), redirect to it
    if (typeof data === 'string') {
      if (data.startsWith('http')) {
        return res.redirect(302, data);
      }
      if (data.startsWith('data:image/') || data.startsWith('data:video/')) {
        data = base64ToBuffer(data);
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
    const type = getMimeType(buffer);
    
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    // For videos, add Accept-Ranges header to support seeking
    if (type.startsWith('video/')) {
      res.setHeader('Accept-Ranges', 'bytes');
      
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        
        if (start >= buffer.length || end >= buffer.length) {
          res.status(416).setHeader('Content-Range', `bytes */${buffer.length}`);
          return res.end();
        }
        
        const chunksize = (end - start) + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
        res.setHeader('Content-Length', chunksize);
        return res.end(buffer.subarray(start, end + 1));
      }
    }
    
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  };

  if (mediaCache.has(cacheKey)) {
    const data = mediaCache.get(cacheKey);
    mediaCache.delete(cacheKey);
    mediaCache.set(cacheKey, data);
    return serveBuffer(data);
  }

  // Include images column if field is image to allow fallback to images[0]
  const selectCols = field === 'image' ? 'image, images' : field;

  db.query(`SELECT ${selectCols} FROM ${table} WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).send(err.message);
    if (!result || result.length === 0) {
      return res.status(404).send('Not found');
    }
    
    let data = result[0][field];

    // Fallback if main image is empty but images array has photos
    if ((!data || (Buffer.isBuffer(data) && data.length === 0)) && field === 'image' && result[0].images) {
      let imagesData = result[0].images;
      if (typeof imagesData === 'string') {
        try {
          imagesData = JSON.parse(imagesData);
        } catch (e) {
          imagesData = [];
        }
      }
      if (Array.isArray(imagesData) && imagesData.length > 0 && imagesData[0]) {
        data = imagesData[0];
      }
    }

    if (!data) {
      return res.status(404).send('Not found');
    }
    
    if (Buffer.isBuffer(data) && data.length > 500) {
      if (mediaCache.size >= MAX_CACHE_SIZE) {
        // Evict oldest (first item in Map)
        const firstKey = mediaCache.keys().next().value;
        mediaCache.delete(firstKey);
      }
      mediaCache.set(cacheKey, data);
    }

    serveBuffer(data);
  });
};