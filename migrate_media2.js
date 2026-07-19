require('dotenv').config();
const db = require('./config/db');

async function queryAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results);
    });
  });
}

async function migrate() {
  try {
    console.log('Migrating development_work...');
    const devWork = await queryAsync('SELECT id, image FROM development_work WHERE image IS NOT NULL');
    for (const row of devWork) {
      if (Buffer.isBuffer(row.image)) {
        const hex = row.image.slice(4, 8).toString('hex');
        if (hex === '66747970') { // ftyp
          console.log('Updating dev_work id:', row.id);
          await queryAsync('UPDATE development_work SET video = ?, image = NULL WHERE id = ?', [row.image, row.id]);
          console.log('Updated dev_work id:', row.id);
        }
      }
    }
    console.log('Migrating news...');
    const newsItems = await queryAsync('SELECT id, image FROM news WHERE image IS NOT NULL');
    for (const row of newsItems) {
      if (Buffer.isBuffer(row.image)) {
        const hex = row.image.slice(4, 8).toString('hex');
        if (hex === '66747970') { // ftyp
          console.log('Updating news id:', row.id);
          await queryAsync('UPDATE news SET video = ?, image = NULL WHERE id = ?', [row.image, row.id]);
          console.log('Updated news id:', row.id);
        }
      }
    }
    console.log('DONE!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
migrate();
