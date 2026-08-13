require("dotenv").config({ path: __dirname + '/../.env' });
const db = require("../db");

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS person_funding (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_name VARCHAR(255) NOT NULL,
    place VARCHAR(255),
    address TEXT,
    amount DECIMAL(15, 2),
    funding_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

db.query(createTableQuery, (err, result) => {
  if (err) {
    console.error("Error creating table person_funding:", err.message);
  } else {
    console.log("Table person_funding created successfully.");
  }
  process.exit();
});
