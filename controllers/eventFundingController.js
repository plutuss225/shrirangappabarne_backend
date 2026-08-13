const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");

exports.getAllEventFunding = async (req, res) => {
  const { page, limit, search, place, startDate, endDate, date } = req.query;
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

  let baseSql = " FROM event_funding WHERE 1=1";
  const params = [];

  if (search) {
    baseSql += " AND (title LIKE ? OR place LIKE ? OR title LIKE ? OR place LIKE ? OR title LIKE ? OR place LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${searchEn}%`, `%${searchEn}%`, `%${searchMr}%`, `%${searchMr}%`);
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
            if (item.title) item.title = await translateText(item.title, targetLang);
            if (item.place) item.place = await translateText(item.place, targetLang);
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
          if (item.title) item.title = await translateText(item.title, targetLang);
          if (item.place) item.place = await translateText(item.place, targetLang);
        }
      }
      
      res.json(result);
    });
  }
};

exports.getEventFundingById = (req, res) => {
  const targetLang = getTargetLanguage(req);
  db.query("SELECT * FROM event_funding WHERE id=?", [req.params.id], async (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.length > 0 && targetLang) {
      if (result[0].title) result[0].title = await translateText(result[0].title, targetLang);
      if (result[0].place) result[0].place = await translateText(result[0].place, targetLang);
    }
    res.json(result);
  });
};

exports.createEventFunding = (req, res) => {
  const { title, place, amount, funding_date } = req.body;

  db.query(
    "INSERT INTO event_funding (title, place, amount, funding_date) VALUES (?, ?, ?, ?)",
    [title, place, amount, funding_date],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Event funding added", result });
    }
  );
};

exports.updateEventFunding = (req, res) => {
  const { title, place, amount, funding_date } = req.body;

  let sql = "UPDATE event_funding SET title=?, place=?, amount=?, funding_date=? WHERE id=?";
  let params = [title, place, amount, funding_date, req.params.id];

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Event funding updated" });
  });
};

exports.deleteEventFunding = (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM event_funding WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Event funding deleted" });
  });
};

exports.getUniquePlaces = (req, res) => {
  const sql = `
    SELECT DISTINCT place FROM event_funding WHERE place IS NOT NULL AND place != ''
    UNION 
    SELECT DISTINCT place FROM person_funding WHERE place IS NOT NULL AND place != ''
    ORDER BY place
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    const places = result.map(row => row.place);
    res.json(places);
  });
};

exports.getUniqueDates = (req, res) => {
  const sql = `
    SELECT DISTINCT funding_date FROM event_funding WHERE funding_date IS NOT NULL AND funding_date != ''
    UNION 
    SELECT DISTINCT funding_date FROM person_funding WHERE funding_date IS NOT NULL AND funding_date != ''
    ORDER BY funding_date DESC
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    const dates = result.map(row => row.funding_date);
    res.json(dates);
  });
};

