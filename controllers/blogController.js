const db = require("../db");
const { translateText, getTargetLanguage } = require("../utils/translator");
const { base64ToBuffer, bufferToBase64 } = require("../utils/bufferUtils");

function formatItem(item) {
  if (item && item.id) {
    if (item.has_image) {
      if (item.image_url && (item.image_url.startsWith('http') || item.image_url.startsWith('blob:'))) {
        item.image = item.image_url;
      } else {
        item.image = `/api/media/blogs/${item.id}/image`;
      }
    } else if (item.hasOwnProperty('has_image')) {
      item.image = null;
    }
    delete item.has_image;
    delete item.image_url;
  }
  return item;
}


// Helper to translate blog_points JSON
async function translateBlogPoints(points, targetLang) {
  if (!points) return points;
  try {
    const parsed = typeof points === "string" ? JSON.parse(points) : points;
    if (Array.isArray(parsed)) {
      if (parsed.every((x) => typeof x === "string")) {
        return await Promise.all(parsed.map((p) => translateText(p, targetLang)));
      }
      return await Promise.all(
        parsed.map(async (item) => {
          if (typeof item === "object" && item !== null) {
            const newItem = { ...item };
            for (const key of Object.keys(newItem)) {
              if (typeof newItem[key] === "string") {
                newItem[key] = await translateText(newItem[key], targetLang);
              }
            }
            return newItem;
          }
          return item;
        })
      );
    } else if (typeof parsed === "object" && parsed !== null) {
      const newObj = { ...parsed };
      for (const key of Object.keys(newObj)) {
        if (typeof newObj[key] === "string") {
          newObj[key] = await translateText(newObj[key], targetLang);
        }
      }
      return newObj;
    }
    return parsed;
  } catch (err) {
    console.error("Failed to translate blog_points:", err.message);
    return points;
  }
}

// Helper to translate a single blog item
async function translateBlogItem(item, targetLang) {
  if (!targetLang) {
    // Even if no translation is needed, parse blog_points if it's a string
    if (item.blog_points && typeof item.blog_points === "string") {
      try {
        item.blog_points = JSON.parse(item.blog_points);
      } catch (e) {}
    }
    return item;
  }
  try {
    const [title, content, meta_title, meta_description, blog_points] = await Promise.all([
      translateText(item.title, targetLang),
      translateText(item.content, targetLang),
      translateText(item.meta_title, targetLang),
      translateText(item.meta_description, targetLang),
      translateBlogPoints(item.blog_points, targetLang)
    ]);
    return {
      ...item,
      title,
      content,
      meta_title,
      meta_description,
      blog_points
    };
  } catch (err) {
    console.error("Error in translateBlogItem:", err.message);
    return item;
  }
}

// Generate Slug helper
function generateSlug(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// GET ALL BLOGS
exports.getAllBlogs = (req, res) => {
  const { status, search, date, startDate, endDate } = req.query;
  let conditions = [];
  let params = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  if (search) {
    conditions.push("(title LIKE ? OR content LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (date) {
    conditions.push("DATE(COALESCE(published_at, created_at)) = ?");
    params.push(date);
  } else {
    if (startDate) {
      conditions.push("COALESCE(published_at, created_at) >= ?");
      params.push(startDate);
    }
    if (endDate) {
      let endParam = endDate;
      if (endDate.length === 10) {
        endParam = `${endDate} 23:59:59`;
      }
      conditions.push("COALESCE(published_at, created_at) <= ?");
      params.push(endParam);
    }
  }

  let query = "SELECT id, title, slug, author, meta_title, meta_description, published_at, created_at, status, content, blog_points, LENGTH(image) > 0 as has_image, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url FROM blogs";
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY id DESC LIMIT 20";

  db.query(query, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
    try {
      const translatedResult = await Promise.all(
        result.map((item) => translateBlogItem(item, targetLang))
      );
      res.json(translatedResult);
    } catch (transErr) {
      console.error("Error in blogs translation:", transErr.message);
      // Fallback: parse blog_points for all items without translating
      const parsedResult = result.map((item) => {
        if (item.blog_points && typeof item.blog_points === "string") {
          try {
            item.blog_points = JSON.parse(item.blog_points);
          } catch (e) {}
        }
        return item;
      });
      res.json(parsedResult);
    }
  });
};

// GET BLOG BY ID OR SLUG
exports.getBlogByIdOrSlug = (req, res) => {
  const { idOrSlug } = req.params;
  let query = "SELECT id, title, slug, author, meta_title, meta_description, published_at, created_at, status, content, blog_points, LENGTH(image) > 0 as has_image, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url FROM blogs WHERE slug = ?";
  let params = [idOrSlug];

  // If idOrSlug is an integer, check both id and slug
  if (!isNaN(idOrSlug)) {
    query = "SELECT id, title, slug, author, meta_title, meta_description, published_at, created_at, status, content, blog_points, LENGTH(image) > 0 as has_image, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url FROM blogs WHERE id = ? OR slug = ?";
    params = [parseInt(idOrSlug), idOrSlug];
  }

  db.query(query, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (Array.isArray(result)) result.forEach(formatItem);
    if (result.length === 0) return res.status(404).json({ message: "Blog not found" });

    const targetLang = getTargetLanguage(req);
    try {
      const translatedItem = await translateBlogItem(result[0], targetLang);
      res.json(translatedItem);
    } catch (transErr) {
      console.error("Error in single blog translation:", transErr.message);
      const item = result[0];
      if (item.blog_points && typeof item.blog_points === "string") {
        try {
          item.blog_points = JSON.parse(item.blog_points);
        } catch (e) {}
      }
      res.json(item);
    }
  });
};

// CREATE BLOG
exports.createBlog = (req, res) => {
  const {
    title,
    slug,
    image,
    content,
    meta_title,
    meta_description,
    blog_points,
    author,
    status
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required fields." });
  }

  const finalSlug = slug ? generateSlug(slug) : generateSlug(title);
  const finalBlogPoints = blog_points ? JSON.stringify(blog_points) : null;
  const finalStatus = status || "draft";
  const publishedAt = finalStatus === "published" ? new Date() : null;

  db.query(
    "INSERT INTO blogs (title, slug, image, content, meta_title, meta_description, blog_points, author, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      title,
      finalSlug,
      image ? base64ToBuffer(image) : null,
      content,
      meta_title || null,
      meta_description || null,
      finalBlogPoints,
      author || "Admin",
      finalStatus,
      publishedAt
    ],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ error: "A blog with this slug or title already exists." });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: "Blog created successfully", blogId: result.insertId });
    }
  );
};

// UPDATE BLOG
exports.updateBlog = (req, res) => {
  const { id } = req.params;
  const {
    title,
    slug,
    image,
    content,
    meta_title,
    meta_description,
    blog_points,
    author,
    status,
    published_at
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required fields." });
  }

  const finalSlug = slug ? generateSlug(slug) : generateSlug(title);
  const finalBlogPoints = blog_points ? JSON.stringify(blog_points) : null;

  // Retrieve current status to manage published_at transition
  db.query("SELECT status, published_at FROM blogs WHERE id = ?", [id], (selectErr, selectResult) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    if (selectResult.length === 0) return res.status(404).json({ error: "Blog not found" });

    const currentBlog = selectResult[0];
    let finalPublishedAt = published_at || currentBlog.published_at;

    // Transitioning from draft/null to published
    if (status === "published" && !finalPublishedAt) {
      finalPublishedAt = new Date();
    } else if (status === "draft") {
      finalPublishedAt = null;
    }

    let sql = "UPDATE blogs SET title = ?, slug = ?, content = ?, meta_title = ?, meta_description = ?, blog_points = ?, author = ?, status = ?, published_at = ?";
    let params = [
      title,
      finalSlug,
      content,
      meta_title || null,
      meta_description || null,
      finalBlogPoints,
      author || "Admin",
      status || "draft",
      finalPublishedAt
    ];

    if (image !== undefined && !(typeof image === 'string' && image.startsWith('/api/'))) {
      sql += ", image = ?";
      params.push(base64ToBuffer(image));
    }

    sql += " WHERE id = ?";
    params.push(id);

    db.query(
      sql,
      params,
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "A blog with this slug or title already exists." });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Blog updated successfully" });
      }
    );
  });
};

exports.deleteBlog = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM blogs WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (Array.isArray(result)) result.forEach(formatItem);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Blog not found" });

    res.json({ message: "Blog deleted successfully" });
  });
};

// GET BLOG AUTHORS as categories (distinct non-null authors from published blogs)
// Usage: GET /blogs/categories
exports.getBlogAuthors = (req, res) => {
  db.query(
    "SELECT DISTINCT author FROM blogs WHERE author IS NOT NULL AND TRIM(author) != '' AND status = 'published' ORDER BY author ASC",
    async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
      const authors = result.map((r) => r.author);

      if (targetLang) {
        try {
          const translated = await Promise.all(
            authors.map((a) => translateText(a, targetLang))
          );
          return res.json({ categories: translated });
        } catch (transErr) {
          console.error("Error translating blog authors:", transErr.message);
        }
      }

      res.json({ categories: authors });
    }
  );
};

// GET TOP 4 BLOGS (latest published, useful for homepage sections)
// Usage: GET /blogs/top
exports.getTopBlogs = (req, res) => {
  db.query(
    "SELECT id, title, slug, LENGTH(image) > 0 as has_image, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, author, meta_description, published_at, created_at FROM blogs WHERE status = 'published' ORDER BY id DESC LIMIT 4",
    async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
      try {
        const translated = await Promise.all(
          result.map((item) => translateBlogItem(item, targetLang))
        );
        return res.json(translated);
      } catch (transErr) {
        console.error("Error translating top blogs:", transErr.message);
        res.json(result);
      }
    }
  );
};

// GET ALL PUBLIC BLOGS with optional ?search= filter (latest published first)
// Usage: GET /blogs/public
//        GET /blogs/public?search=keyword
//        GET /blogs/public?search=keyword&lang=mr
exports.getPublicBlogs = (req, res) => {
  const { search } = req.query;

  let conditions = ["status = 'published'"];
  const params = [];

  if (search && search.trim()) {
    conditions.push("(title LIKE ? OR content LIKE ? OR meta_description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const query =
    "SELECT id, title, slug, LENGTH(image) > 0 as has_image, CASE WHEN LENGTH(image) < 300 THEN CONVERT(image, CHAR) ELSE NULL END as image_url, author, meta_description, published_at, created_at FROM blogs WHERE " +
    conditions.join(" AND ") +
    " ORDER BY id DESC LIMIT 20";

  db.query(query, params, async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (Array.isArray(result)) result.forEach(formatItem);
    const targetLang = getTargetLanguage(req);
    try {
      const translated = await Promise.all(
        result.map((item) => translateBlogItem(item, targetLang))
      );
      return res.json(translated);
    } catch (transErr) {
      console.error("Error translating public blogs:", transErr.message);
      res.json(result);
    }
  });
};

