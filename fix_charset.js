require("dotenv").config({ path: __dirname + '/.env' });
const db = require("./config/db");

const queries = [
  "ALTER TABLE event_funding CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
  "ALTER TABLE person_funding CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
];

const runQueries = async () => {
  for (let q of queries) {
    await new Promise((resolve, reject) => {
      db.query(q, (err, result) => {
        if (err) {
          console.error("Error running query:", q, err.message);
          resolve(false);
        } else {
          console.log("Success:", q);
          resolve(true);
        }
      });
    });
  }
  process.exit();
};

runQueries();
