const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a base64 image string to Cloudinary
 * @param {string} base64 - Base64 encoded image string
 * @param {string} folder - Folder name in Cloudinary
 * @returns {Promise<string>} - Secure URL of the uploaded image
 */
exports.uploadImage = async (base64, folder = "uploads") => {
  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder: folder,
      resource_type: "auto",
    });
    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};

/**
 * Extracts public_id from Cloudinary URL and deletes the image
 * @param {string} url - Cloudinary image URL
 * @returns {Promise<void>}
 */
exports.deleteImageFromCloudinary = async (url) => {
  try {
    if (!url || !url.includes("res.cloudinary.com")) {
      console.log(`Cloudinary delete skipped: URL does not look like a Cloudinary URL (${url})`);
      return;
    }

    // Example URL: https://res.cloudinary.com/dbxxxx/image/upload/v17000000/uploads/filename.jpg
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");
    
    if (uploadIndex !== -1) {
      // Determine resource type (image, video, raw) from URL
      const resourceType = uploadIndex > 0 ? parts[uploadIndex - 1] : "image";
      
      const versionAndPath = parts.slice(uploadIndex + 1);
      
      // Check if the first part is a version string (v followed by numbers)
      let pathParts = versionAndPath;
      if (/^v\d+$/.test(versionAndPath[0])) {
        pathParts = versionAndPath.slice(1);
      }
      
      const publicIdWithExt = pathParts.join("/");
      const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf(".")) || publicIdWithExt;

      console.log("Cloudinary URL parsing -> URL:", url, "-> Extracted publicId:", publicId, "resourceType:", resourceType);

      if (publicId) {
        const destroyResult = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        console.log(`Deleted media from Cloudinary: ${publicId}, Result:`, destroyResult);
      }
    } else {
      console.log("Cloudinary URL parsing -> 'upload' not found in URL:", url);
    }
  } catch (error) {
    console.error("Cloudinary delete error:", error);
  }
};
