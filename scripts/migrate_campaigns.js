require("dotenv").config({ path: __dirname + "/../.env" });
const db = require("../config/db");

async function run() {
  const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  };

  try {
    console.log("Starting campaign migration...");

    // 1. Create calling_campaigns table
    await query(`
      CREATE TABLE IF NOT EXISTS calling_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT NULL,
        status ENUM('active', 'inactive', 'archived') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("calling_campaigns table created or already exists.");

    // 2. Insert default campaign 'दिवाळी फराळ & दीप महोत्सव'
    await query(`
      INSERT IGNORE INTO calling_campaigns (name, description, status) 
      VALUES ('दिवाळी फराळ & दीप महोत्सव', 'दिवाळी फराळ व दीप महोत्सव कॉलिंग अभियान', 'active');
    `);
    console.log("Inserted default campaign 'दिवाळी फराळ & दीप महोत्सव'.");

    // 3. Check if 'campaign' column exists in calling_leads
    const columns = await query("SHOW COLUMNS FROM calling_leads LIKE 'campaign'");
    if (columns.length === 0) {
      console.log("Adding column 'campaign' to calling_leads...");
      await query(`
        ALTER TABLE calling_leads 
        ADD COLUMN campaign VARCHAR(255) NOT NULL DEFAULT 'दिवाळी फराळ & दीप महोत्सव' AFTER id;
      `);
      console.log("Column 'campaign' added.");
    } else {
      console.log("Column 'campaign' already exists in calling_leads.");
    }

    // 4. Update all existing leads to default campaign
    const updateRes = await query(`
      UPDATE calling_leads 
      SET campaign = 'दिवाळी फराळ & दीप महोत्सव' 
      WHERE campaign IS NULL OR campaign = '';
    `);
    console.log("Updated existing leads to 'दिवाळी फराळ & दीप महोत्सव':", updateRes.affectedRows);

    // 5. Add index on campaign if not exists
    const indexes = await query("SHOW INDEX FROM calling_leads WHERE Key_name = 'idx_calling_leads_campaign'");
    if (indexes.length === 0) {
      await query("CREATE INDEX idx_calling_leads_campaign ON calling_leads (campaign)");
      console.log("Index 'idx_calling_leads_campaign' created.");
    } else {
      console.log("Index 'idx_calling_leads_campaign' already exists.");
    }

    // 6. Verify leads count per campaign
    const counts = await query("SELECT campaign, COUNT(*) as count FROM calling_leads GROUP BY campaign");
    console.log("Campaign counts in calling_leads:", counts);

    // 7. Verify campaigns in calling_campaigns
    const campaigns = await query("SELECT * FROM calling_campaigns");
    console.log("Campaigns table records:", campaigns);

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    process.exit(0);
  }
}

run();
