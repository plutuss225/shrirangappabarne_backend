require("dotenv").config();
const { uploadImage, deleteImageFromCloudinary } = require("./utils/cloudinary");

async function test() {
  try {
    // 1x1 pixel base64 image
    const base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    console.log("Uploading test image...");
    const url = await uploadImage(base64, "uploads");
    console.log("Uploaded successfully. URL:", url);
    
    console.log("Deleting image...");
    await deleteImageFromCloudinary(url);
    console.log("Delete function completed.");
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
