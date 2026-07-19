function base64ToBuffer(base64String) {
  if (!base64String || typeof base64String !== 'string') return base64String;
  const headerEnd = base64String.indexOf(';base64,');
  if (headerEnd === -1) return base64String; 
  const base64Data = base64String.substring(headerEnd + 8);
  return Buffer.from(base64Data, "base64");
}

function bufferToBase64(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return buffer;
  let mimeType = 'image/jpeg';
  if (buffer.length > 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      mimeType = 'image/png';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      mimeType = 'image/gif';
    } else if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
      mimeType = 'video/webm';
    } else {
      // Check for MP4 'ftyp' in first 32 bytes
      const header = buffer.subarray(0, 32).toString('ascii');
      if (header.includes('ftyp')) {
        mimeType = 'video/mp4';
      }
    }
  }
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

module.exports = { base64ToBuffer, bufferToBase64 };
