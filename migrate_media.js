require('dotenv').config();
const db = require('./config/db');

async function migrate() {
  console.log('Migrating development_work...');
  db.query('SELECT id, image FROM development_work WHERE image IS NOT NULL', (err, results) => {
    if (err) throw err;
    for (const row of results) {
      if (Buffer.isBuffer(row.image)) {
        const hex = row.image.slice(4, 8).toString('hex');
        if (hex === '66747970') { // ftyp
          console.log('Found video in image column for dev_work id:', row.id);
          db.query('UPDATE development_work SET video = ?, image = NULL WHERE id = ?', [row.image, row.id]);
        }
      }
    }
    console.log('Migrating news...');
    db.query('SELECT id, image FROM news WHERE image IS NOT NULL', (err, newsResults) => {
      if (err) throw err;
      for (const row of newsResults) {
        if (Buffer.isBuffer(row.image)) {
          const hex = row.image.slice(4, 8).toString('hex');
          if (hex === '66747970') { // ftyp
            console.log('Found video in image column for news id:', row.id);
            db.query('UPDATE news SET video = ?, image = NULL WHERE id = ?', [row.image, row.id]);
          }
        }
      }
      setTimeout(() => { console.log('Done!'); process.exit(0); }, 2000);
    });
  });
}

migrate();
