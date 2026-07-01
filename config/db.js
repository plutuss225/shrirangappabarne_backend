const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.SQL_HOST || "localhost",
  user: process.env.SQL_USER || "root",
  password: process.env.SQL_PASSWORD || "",
  database: process.env.SQL_DATABASE || "shrirang",
  port: process.env.SQL_PORT || 3306
});

// Connect DB
db.connect((err) => {
  if (err) {
    console.log("Database connection failed:", err.message);
  } else {
    console.log("MySQL Connected Successfully!");
  }
});

module.exports = db;