const db = require('../db');

exports.getMedia = (req, res) => {
  const { table, id, field } = req.params;
  const allowedTables = ['news', 'development_work', 'event', 'images', 'blogs'];
  const allowedFields = ['image', 'video', 'main_image', 'slider_images'];
  
  if (!allowedTables.includes(table) || !allowedFields.includes(field)) {
    return res.status(400).send('Invalid request');
  }

  db.query(`SELECT ${field} FROM ${table} WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).send(err);
    if (!result || result.length === 0 || !result[0][field]) {
      return res.status(404).send('Not found');
    }
    
    const buffer = result[0][field];
    const type = field === 'video' ? 'video/mp4' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  });
};
