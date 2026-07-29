const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a base64 string or file path to Cloudinary.
 * @param {string} file - The base64 string or path to upload.
 * @param {string} resourceType - 'auto', 'image', 'video', 'raw'
 * @returns {Promise<string>} The secure URL of the uploaded asset, or null if failed.
 */
const uploadMedia = async (file, resourceType = 'auto') => {
  if (!file) return null;
  
  try {
    const result = await cloudinary.uploader.upload(file, {
      resource_type: resourceType,
      folder: 'shrirangappabarne',
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
};

module.exports = {
  cloudinary,
  uploadMedia,
};
