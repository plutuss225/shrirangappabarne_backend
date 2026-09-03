const mysql = require("mysql2");

const db = mysql.createPool({
  host: process.env.SQL_HOST || "localhost",
  user: process.env.SQL_USER || "root",
  password: process.env.SQL_PASSWORD || "",
  database: process.env.SQL_DATABASE || "shrirang",
  port: process.env.SQL_PORT || 3306,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.log("Database connection failed:", err.message);
  } else {
    console.log("MySQL Connected Successfully!");
    
    // Attempt to automatically fix the ER_NET_PACKET_TOO_LARGE error
    connection.query("SET GLOBAL max_allowed_packet = 1073741824", (setErr) => {
      if (setErr) {
        console.log("Note: Could not automatically set max_allowed_packet. You may need to update my.ini/my.cnf manually if you face ER_NET_PACKET_TOO_LARGE errors.");
      } else {
        console.log("Successfully increased max_allowed_packet to 1GB to support large video uploads.");
      }
      connection.release();
    });
  }
});

module.exports = db;