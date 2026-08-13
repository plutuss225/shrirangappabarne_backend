const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

exports.getAllPersonFunding = async (req, res) => {
  const { page, limit, search, place, date, startDate, endDate } = req.query;
  const targetLang = getTargetLanguage(req);

  let searchEn = search, searchMr = search;
  if (search) {
    try {
      const isMr = /[\u0900-\u097F]/.test(search);
      if (isMr) {
        searchEn = await translateText(search, "en");
      } else {
        searchMr = await translateText(search, "mr");
      }
    } catch (e) {
      console.error("Error translating search term:", e.message);
    }
  }

  let baseSql = " FROM person_funding WHERE 1=1";
  const params = [];

  if (search) {
    baseSql += " AND (person_name LIKE ? OR place LIKE ? OR address LIKE ? OR person_name LIKE ? OR place LIKE ? OR address LIKE ? OR person_name LIKE ? OR place LIKE ? OR address LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchMr}%`, `%${searchMr}%`, `%${searchMr}%`);
  }

  if (place) {
    baseSql += " AND place LIKE ?";
    params.push(`%${place}%`);
  }

  if (date) {
    baseSql += " AND funding_date = ?";
    params.push(date);
  }

  if (startDate) {
    baseSql += " AND funding_date >= ?";
    params.push(startDate);
  }

  if (endDate) {
    baseSql += " AND funding_date <= ?";
    params.push(endDate);
  }

  let sql = "SELECT *" + baseSql + " ORDER BY created_at DESC";

  if (page && limit) {
    let countSql = "SELECT COUNT(*) as total" + baseSql;
    
    db.query(countSql, params, (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      const total = countResult[0].total;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += " LIMIT ? OFFSET ?";
      const limitParams = [...params, parseInt(limit), offset];

      db.query(sql, limitParams, async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        if (targetLang) {
          for (let item of result) {
            if (item.person_name) item.person_name = await translateText(item.person_name, targetLang);
            if (item.place) item.place = await translateText(item.place, targetLang);
            if (item.address) item.address = await translateText(item.address, targetLang);
          }
        }

        return res.json({
          data: result,
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        });
      });
    });
  } else {
    db.query(sql, params, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (targetLang) {
        for (let item of result) {
          if (item.person_name) item.person_name = await translateText(item.person_name, targetLang);
          if (item.place) item.place = await translateText(item.place, targetLang);
          if (item.address) item.address = await translateText(item.address, targetLang);
        }
      }
      
      res.json(result);
    });
  }
};

exports.getPersonFundingById = (req, res) => {
  const targetLang = getTargetLanguage(req);
  db.query("SELECT * FROM person_funding WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.length > 0 && targetLang) {
      if (result[0].person_name) result[0].person_name = await translateText(result[0].person_name, targetLang);
      if (result[0].place) result[0].place = await translateText(result[0].place, targetLang);
      if (result[0].address) result[0].address = await translateText(result[0].address, targetLang);
    }
    res.json(result);
  });
};

exports.createPersonFunding = (req, res) => {
  const { person_name, place, address, amount, funding_date } = req.body;

  db.query(
    "INSERT INTO person_funding (person_name, place, address, amount, funding_date) VALUES (?, ?, ?, ?, ?)",
    [person_name, place, address, amount, funding_date],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Person funding added", result });
    }
  );
};

exports.updatePersonFunding = (req, res) => {
  const { person_name, place, address, amount, funding_date } = req.body;

  let sql = "UPDATE person_funding SET person_name=?, place=?, address=?, amount=?, funding_date=? WHERE id=?";
  let params = [person_name, place, address, amount, funding_date, req.params.id];

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Person funding updated" });
  });
};

exports.deletePersonFunding = (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM person_funding WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Person funding deleted" });
  });
};
