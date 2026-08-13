require("dotenv").config({ path: __dirname + '/../.env' });
const db = require("../db");

const alterEventFunding = "ALTER TABLE event_funding MODIFY funding_date VARCHAR(255);";
const alterPersonFunding = "ALTER TABLE person_funding MODIFY funding_date VARCHAR(255);";

db.query(alterEventFunding, (err) => {
  if (err) {
    console.error("Error altering event_funding:", err.message);
  } else {
    console.log("event_funding altered successfully.");
  }
  
  db.query(alterPersonFunding, (err2) => {
    if (err2) {
      console.error("Error altering person_funding:", err2.message);
    } else {
      console.log("person_funding altered successfully.");
    }
    process.exit();
  });
});
