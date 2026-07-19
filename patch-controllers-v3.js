const fs = require('fs');

function patchController(file, table, idField, imageField, hasImage) {
  let code = fs.readFileSync(file, 'utf8');
  
  // 1. Update formatItem
  // find function formatItem(item) { ... }
  // Replace it entirely
  const formatItemRegex = /function\s+formatItem\s*\([^)]*\)\s*\{[\s\S]*?return\s+item;\s*\}/g;
  const newFormatItem = `function formatItem(item) {
  if (item && item.id) {
    if (item.${hasImage}) {
      item.${imageField} = \`/api/media/${table}/\${item.id}/${imageField}\`;
    } else if (item.hasOwnProperty('${hasImage}')) {
      item.${imageField} = null;
    }
    delete item.${hasImage};
  }
  return item;
}`;
  code = code.replace(formatItemRegex, newFormatItem);
  
  // 2. Remove bufferToBase64 references in the rest of the file
  // Wait, formatItem was the only place bufferToBase64 was used!
  
  // 3. Update SELECT * queries
  // For event:
  if (table === 'event') {
    code = code.replace(/SELECT\s+\*\s+FROM\s+event/g, `SELECT id, title, description, event_date, created_at, LENGTH(main_image) > 0 as ${hasImage} FROM event`);
  } else if (table === 'images') {
    code = code.replace(/SELECT\s+\*\s+FROM\s+images/g, `SELECT id, title, created_at, LENGTH(image) > 0 as ${hasImage} FROM images`);
  } else if (table === 'blogs') {
    code = code.replace(/SELECT\s+\*\s+FROM\s+blogs/g, `SELECT id, title, slug, author, meta_description, published_at, created_at, LENGTH(image) > 0 as ${hasImage} FROM blogs`);
    // also patch the specific ones in blogs
    code = code.replace(/SELECT\s+id,\s*title,\s*slug,\s*image,\s*author/g, `SELECT id, title, slug, LENGTH(image) > 0 as ${hasImage}, author`);
  }

  fs.writeFileSync(file, code);
  console.log(`Patched ${file}`);
}

patchController('controllers/eventController.js', 'event', 'id', 'main_image', 'has_main_image');
patchController('controllers/imageController.js', 'images', 'id', 'image', 'has_image');
patchController('controllers/blogController.js', 'blogs', 'id', 'image', 'has_image');

console.log("Done patching controllers.");
