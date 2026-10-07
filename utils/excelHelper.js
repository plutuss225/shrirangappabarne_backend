const xlsx = require("xlsx");

function parseAmount(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[₹$,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDateValue(val) {
  if (val === null || val === undefined || val === "") return "";
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    try {
      const parsed = xlsx.SSF.parse_date_code(val);
      if (parsed) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, "0");
        const d = String(parsed.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch (e) {
      // Fallback
    }
  }
  return String(val).trim();
}

function normalizeKey(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[\s_\-–—:()]/g, "");
}

function extractEventFundingRows(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  let targetSheetName = workbook.SheetNames[0];
  const eventSheet = workbook.SheetNames.find(s => /event|इव्हेंट/i.test(s));
  if (eventSheet) {
    targetSheetName = eventSheet;
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) return [];

  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  const validRows = [];

  for (const raw of rawRows) {
    let title = "";
    let place = "";
    let amount = 0;
    let funding_date = "";

    for (const [key, value] of Object.entries(raw)) {
      const normKey = normalizeKey(key);

      if (
        /^(title|eventtitle|eventname|event|इव्हेंटशीर्षक|शीर्षक|कार्यक्रमाचेनाव|इव्हेंट|नाव)$/.test(normKey) ||
        normKey.includes("title") ||
        normKey.includes("शीर्षक")
      ) {
        title = String(value).trim();
      } else if (
        /^(place|location|village|city|ठिकाण|गाव|शहर|गावशहर)$/.test(normKey) ||
        normKey.includes("place") ||
        normKey.includes("ठिकाण")
      ) {
        place = String(value).trim();
      } else if (
        /^(amount|fund|fundingamount|cost|रक्कम|निधी|रक्कमरु|रुपये)$/.test(normKey) ||
        normKey.includes("amount") ||
        normKey.includes("रक्कम")
      ) {
        amount = parseAmount(value);
      } else if (
        /^(date|fundingdate|month|year|तारीख|दिनांक|महिना|वर्ष|कालावधी)$/.test(normKey) ||
        normKey.includes("date") ||
        normKey.includes("तारीख") ||
        normKey.includes("दिनांक")
      ) {
        funding_date = parseDateValue(value);
      }
    }

    if (title) {
      validRows.push({
        title,
        place,
        amount,
        funding_date
      });
    }
  }

  return validRows;
}

function extractPersonFundingRows(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  let targetSheetName = workbook.SheetNames[0];
  const personSheet = workbook.SheetNames.find(s => /person|beneficiary|व्यक्ती/i.test(s));
  if (personSheet) {
    targetSheetName = personSheet;
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) return [];

  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  const validRows = [];

  for (const raw of rawRows) {
    let person_name = "";
    let place = "";
    let address = "";
    let amount = 0;
    let funding_date = "";

    for (const [key, value] of Object.entries(raw)) {
      const normKey = normalizeKey(key);

      if (
        /^(personname|name|beneficiary|beneficiaryname|person|व्यक्तीचेनाव|नाव|लाभार्थी|लाभार्थ्याचेनाव)$/.test(normKey) ||
        normKey.includes("personname") ||
        normKey.includes("beneficiary") ||
        normKey.includes("व्यक्ती")
      ) {
        person_name = String(value).trim();
      } else if (
        /^(place|location|village|city|ठिकाण|गाव|शहर|गावशहर)$/.test(normKey) ||
        normKey.includes("place") ||
        normKey.includes("ठिकाण")
      ) {
        place = String(value).trim();
      } else if (
        /^(address|fulladdress|पत्ता|संपूर्णपत्ता)$/.test(normKey) ||
        normKey.includes("address") ||
        normKey.includes("पत्ता")
      ) {
        address = String(value).trim();
      } else if (
        /^(amount|fund|fundingamount|cost|रक्कम|निधी|रक्कमरु|रुपये)$/.test(normKey) ||
        normKey.includes("amount") ||
        normKey.includes("रक्कम")
      ) {
        amount = parseAmount(value);
      } else if (
        /^(date|fundingdate|month|year|तारीख|दिनांक|महिना|वर्ष|कालावधी)$/.test(normKey) ||
        normKey.includes("date") ||
        normKey.includes("तारीख") ||
        normKey.includes("दिनांक")
      ) {
        funding_date = parseDateValue(value);
      }
    }

    if (person_name) {
      validRows.push({
        person_name,
        place,
        address,
        amount,
        funding_date
      });
    }
  }

  return validRows;
}

function generateEventTemplate() {
  const wb = xlsx.utils.book_new();
  const sampleData = [
    {
      "Event Title": "समाज मंदिर सभागृह नूतनीकरण (Community Hall Renovation)",
      "Place": "पिंपरी (Pimpri)",
      "Amount": 500000,
      "Funding Date": "ऑगस्ट २०२६"
    },
    {
      "Event Title": "शाळा क्रीडा साहित्य अनुदान (School Sports Grant)",
      "Place": "चिंचवड (Chinchwad)",
      "Amount": 250000,
      "Funding Date": "जुलै २०२६"
    },
    {
      "Event Title": "अंतर्गत रस्ते डांबरीकरण (Internal Road Works)",
      "Place": "मावळ (Maval)",
      "Amount": 1000000,
      "Funding Date": "सप्टेंबर २०२६"
    }
  ];

  const ws = xlsx.utils.json_to_sheet(sampleData);
  ws["!cols"] = [
    { wch: 45 },
    { wch: 25 },
    { wch: 15 },
    { wch: 20 }
  ];

  xlsx.utils.book_append_sheet(wb, ws, "Event Funding");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

function generatePersonTemplate() {
  const wb = xlsx.utils.book_new();
  const sampleData = [
    {
      "Person Name": "रमेश शंकर पाटील (Ramesh Shankar Patil)",
      "Place": "पिंपरी (Pimpri)",
      "Address": "फ्लॅट क्र. ४०२, साई पार्क, पिंपरी, पुणे",
      "Amount": 50000,
      "Funding Date": "ऑगस्ट २०२६"
    },
    {
      "Person Name": "सुनीता विलास गायकवाड (Sunita Vilas Gaikwad)",
      "Place": "चिंचवड (Chinchwad)",
      "Address": "घर क्र. १२, संभाजी चौक, चिंचवड",
      "Amount": 75000,
      "Funding Date": "जुलै २०२६"
    },
    {
      "Person Name": "अमित मनोहर शिंदे (Amit Manohar Shinde)",
      "Place": "देहूरोड (Dehuroad)",
      "Address": "स्टेशन रोड, देहूरोड",
      "Amount": 30000,
      "Funding Date": "सप्टेंबर २०२६"
    }
  ];

  const ws = xlsx.utils.json_to_sheet(sampleData);
  ws["!cols"] = [
    { wch: 35 },
    { wch: 25 },
    { wch: 45 },
    { wch: 15 },
    { wch: 20 }
  ];

  xlsx.utils.book_append_sheet(wb, ws, "Person Funding");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  extractEventFundingRows,
  extractPersonFundingRows,
  generateEventTemplate,
  generatePersonTemplate
};
