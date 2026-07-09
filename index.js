require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db"); // Load and connect to database
const morgan = require("morgan");

const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT;

// Enable CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || allowedOrigins.length === 0) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// Log API hits
app.use(morgan("dev"));

// Body Parser Middleware with size limits for base64 uploads
app.use(bodyParser.json({ limit: "500mb" }));
app.use(bodyParser.urlencoded({ limit: "500mb", extended: true }));

// Serve uploads folder statically
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Upload Endpoint
const { uploadImage } = require("./utils/cloudinary");

app.post("/api/upload", async (req, res) => {
  const { name, base64 } = req.body;
  if (!base64) return res.status(400).json({ error: "No image base64 data provided" });

  try {
    const headerEnd = base64.indexOf(';base64,');
    if (!base64.startsWith('data:') || headerEnd === -1) {
      return res.status(400).json({ error: "Invalid base64 string format" });
    }



    const secureUrl = await uploadImage(base64, "uploads");
    res.json({ url: secureUrl });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload file: " + err.message });
  }
});

app.post("/upload", (req, res) => {
  res.redirect(307, "/api/upload");
});

// Import Routes
const adminRoute = require("./Routes/adminroute");
const newsRoute = require("./Routes/newsroute");
const developmentWorkRoute = require("./Routes/developmentworkroute");
const blogRoute = require("./Routes/blogroute");
const imageRoute = require("./Routes/imageroute");
const contactRoute = require("./Routes/contactroute");
const eventRoute = require("./Routes/eventroute");

// Register Routes
app.use("/api/admin", adminRoute);
app.use("/api/news", newsRoute);
app.use("/api/development_work", developmentWorkRoute);
app.use("/api/blogs", blogRoute);
app.use("/api/images", imageRoute);
app.use("/api/contact", contactRoute);
app.use("/api/events", eventRoute);
app.use("/api/event", eventRoute);


// Also support routes without /api prefix just in case
app.use("/admin", adminRoute);
app.use("/news", newsRoute);
app.use("/development_work", developmentWorkRoute);
app.use("/blogs", blogRoute);
app.use("/images", imageRoute);
app.use("/contact", contactRoute);
app.use("/events", eventRoute);
app.use("/event", eventRoute);


// Base Route
app.get("/", (req, res) => {
  res.send("Shrirang Appa Barne Backend API is running...");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
