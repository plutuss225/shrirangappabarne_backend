const axios = require('axios');

// Bounded LRU cache to prevent memory leaks in production
const translationCache = new Map();
const MAX_CACHE_SIZE = 1500;

function setCache(key, val) {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }
  translationCache.set(key, val);
}

async function translateText(text, targetLang) {
  if (!text || !targetLang) return text;
  
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed || !/[a-zA-Z\u0900-\u097F]/.test(trimmed)) {
    return text;
  }
  
  // Normalize targetLang to lowercase 2-letter code
  const target = targetLang.toLowerCase().substring(0, 2);
  
  // Validate target language code (must be 2 letters, not "au" for auto)
  if (!/^[a-z]{2}$/.test(target) || target === "au") {
    return text;
  }
  
  // Detect source language based on presence of Devanagari characters (Marathi)
  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  const source = hasDevanagari ? "mr" : "en";
  
  if (source === target) return text;
  
  const cacheKey = `${source}|${target}|${trimmed}`;
  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    if (typeof cached === 'string') return cached;
    return await cached;
  }
  
  const translationPromise = (async () => {
    // Google Translate free endpoint (gtx)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(trimmed)}`;
    
    try {
      const response = await axios.get(url, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (response.data && response.data[0]) {
        return response.data[0].map(item => item[0]).join('');
      }
    } catch (error) {
      if (error.code === 'ECONNABORTED' || (error.response && error.response.status === 429)) {
        try {
          // Fallback to Lingva Translation API which handles load better than MyMemory
          const fallbackUrl = `https://lingva.ml/api/v1/${source}/${target}/${encodeURIComponent(trimmed)}`;
          const fallbackResponse = await axios.get(fallbackUrl, { timeout: 6000 });
          if (fallbackResponse.data && fallbackResponse.data.translation) {
            return fallbackResponse.data.translation;
          }
        } catch (fallbackError) {
          // Last resort: MyMemory API
          try {
             const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${source}|${target}`;
             const myMemoryResponse = await axios.get(myMemoryUrl, { timeout: 6000 });
             if (myMemoryResponse.data && myMemoryResponse.data.responseData && myMemoryResponse.data.responseData.translatedText) {
               const translated = myMemoryResponse.data.responseData.translatedText;
               if (!translated.includes("LIMIT EXCEEDED")) {
                 return translated;
               }
             }
          } catch (lastError) {
             console.warn("All translation APIs failed or timed out. Returning original text.");
          }
        }
      } else {
        console.error(`Translation failed for text "${trimmed.substring(0, 20)}...":`, error.message);
      }
    }
    
    return text; // Fallback to original text on failure
  })();

  setCache(cacheKey, translationPromise);

  try {
    const translated = await translationPromise;
    // Replace in-flight Promise with string in cache to free closure memory
    setCache(cacheKey, translated);
    return translated;
  } catch (err) {
    translationCache.delete(cacheKey);
    return text;
  }
}

function getTargetLanguage(req) {
  if (req.query && req.query.lang) {
    return req.query.lang;
  }
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    const match = acceptLang.split(",")[0].split(";")[0].trim();
    if (match) return match;
  }
  return null;
}

module.exports = {
  translateText,
  getTargetLanguage
};
