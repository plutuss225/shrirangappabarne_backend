require("dotenv").config({ path: __dirname + '/../.env' });
const db = require("../db");

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS event_funding (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    place VARCHAR(255),
    amount DECIMAL(15, 2),
    funding_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

db.query(createTableQuery, (err, result) => {
  if (err) {
    console.error("Error creating table event_funding:", err.message);
  } else {
    console.log("Table event_funding created successfully.");
  }
  process.exit();
});
