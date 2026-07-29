require('dotenv').config();
const db = require('../db');
const { bufferToBase64 } = require('../utils/bufferUtils');
const { uploadMedia } = require('../utils/cloudinary');

const util = require('util');
const query = util.promisify(db.query).bind(db);

async function migrateTable(tableName) {
  console.log(`Starting migration for table: ${tableName}`);
  
  try {
    // Select all rows where video is present, is a BLOB (length > 300), and is not already a URL.
    const rows = await query(`SELECT id, video FROM ${tableName} WHERE video IS NOT NULL AND LENGTH(video) > 300`);
    
    console.log(`Found ${rows.length} videos to migrate in ${tableName}.`);
    
    for (let row of rows) {
      const videoBuffer = row.video;
      
      // Safety check: if it's already a string URL (e.g. starts with http), skip it.
      if (typeof videoBuffer === 'string' && (videoBuffer.startsWith('http') || videoBuffer.startsWith('/api/'))) {
        console.log(`Skipping ID ${row.id} in ${tableName} as it is already a URL.`);
        continue;
      }
      
      console.log(`Uploading video for ID ${row.id}...`);
      const base64Str = bufferToBase64(videoBuffer);
      
      const cloudinaryUrl = await uploadMedia(base64Str, 'video');
      
      if (cloudinaryUrl) {
        console.log(`Successfully uploaded ID ${row.id}: ${cloudinaryUrl}`);
        // Save back to database
        await query(`UPDATE ${tableName} SET video = ? WHERE id = ?`, [Buffer.from(cloudinaryUrl, 'utf8'), row.id]);
        console.log(`Updated ID ${row.id} in database.`);
      } else {
        console.error(`Failed to upload video for ID ${row.id}.`);
      }
    }
    
    console.log(`Finished migrating table: ${tableName}\n`);
  } catch (error) {
    console.error(`Error migrating table ${tableName}:`, error);
  }
}

async function runMigration() {
  console.log("--- Starting Video Migration to Cloudinary ---");
  await migrateTable('news');
  await migrateTable('event');
  await migrateTable('development_work');
  console.log("--- Migration Complete ---");
  process.exit(0);
}

runMigration();
