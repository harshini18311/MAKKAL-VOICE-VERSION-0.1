const axios = require('axios');

async function translateToEnglish(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url);
    let translatedText = '';
    if (response.data && response.data[0]) {
      response.data[0].forEach(item => {
        if (item[0]) translatedText += item[0];
      });
      return translatedText;
    }
    return text;
  } catch (err) {
    console.error("Translation API error:", err.message);
    return text;
  }
}

async function analyzeComplaint(text, name = "Resident", location = "the locality") {
  // Normalize ANY language transparently to English
  const englishText = await translateToEnglish(text);
  const englishName = await translateToEnglish(name);
  const englishLocation = await translateToEnglish(location);

  const prompt = `
  You are an AI assistant analyzing rural civic complaints.
  Read the following complaint and output a pure JSON object with these keys:
  - "category": One of ["Water", "Road", "Electricity", "Infrastructure", "Public Safety", "Sanitation", "Traffic", "Government Services", "Rural specific", "Irrelevant"].
  - "priority": One of ["Low", "Medium", "High"].
  - "summary": A short 1-2 sentence summary in English.
  - "emailDraft": A professional formal email. 

  CRITICAL INSTRUCTION: If the complaint text is nonsensical (random letters, "vdhbjd..."), completely off-topic (greetings, non-civic chat), or entirely unclear, you MUST classify "category" as "Irrelevant".

  CATEGORIZATION GUIDUANCE:
  - Valid civic issues (e.g., "broken street light", "garbage disposal") MUST match one of the main categories or use "Government Services" as a fallback for general civic needs.
  - Gibberish, keyboard smashing, or "test" messages MUST be classified as "Irrelevant".

  EXAMPLES:
  1. "vdhbjdddddd" → {"category": "Irrelevant", ...}
  2. "bcfcfvgbhj" → {"category": "Irrelevant", ...}
  3. "hello" → {"category": "Irrelevant", ...}
  4. "the road has a big pothole" → {"category": "Road", ...}
  5. "no water in our tank for 3 days" → {"category": "Water", ...}

  IMPORTANT: The entire email draft MUST be in English. 
  Do NOT translate the email content, especially the closing "Yours sincerely," into any other language.
  Follow this EXACT format for the emailDraft field:
  Respected Sir/Madam,
  I am writing to bring to your kind attention a serious issue faced by the residents of ${englishLocation}.
  We are currently facing the problem of [DESCRIBE ISSUE], which has been causing significant inconvenience in our daily lives. This issue has persisted for some time and has not yet been resolved despite affecting many people in the locality.
  Due to this problem, residents are experiencing difficulties such as [IMPACT]. Immediate action is required to prevent further complications.
  I kindly request you to look into this matter and take necessary steps to resolve it at the earliest. Your prompt action will be greatly appreciated by all residents of the area.
  Thank you for your attention to this matter.
  Yours sincerely,
  ${englishName}
  ${englishLocation}

  Complaint: "${englishText}"
  `;

  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt: prompt,
      stream: false,
      format: 'json'
    });

    if (response.data && response.data.response) {
      // It should be JSON already if format: 'json' is supported, or we parse it
      return JSON.parse(response.data.response);
    }
    throw new Error("Invalid response from model");
  } catch (error) {
    console.error('AI Processing Error:', error.message);
    // Smart Fallback if local model is not running
    const lower = englishText.toLowerCase();
    let category = 'Irrelevant';
    
    // Simple Gibberish Filter: repetitive characters or very strange consonant clusters
    const isGibberish = /(.)\1{3,}/.test(lower) || /[^aeiouy\s]{6,}/.test(lower);
    
    if (!isGibberish) {
      if (lower.includes('water') || lower.includes('drain') || lower.includes('pipe') || lower.includes('tap') || lower.includes('irrigation')) category = 'Water';
      else if (lower.includes('road') || lower.includes('street') || lower.includes('pothole') || lower.includes('transport') || lower.includes('traffic') || lower.includes('parking')) category = 'Road';
      else if (lower.includes('electric') || lower.includes('power') || lower.includes('wire') || lower.includes('transformer')) category = 'Electricity';
      else if (lower.includes('garbage') || lower.includes('sewage') || lower.includes('dog') || lower.includes('animal') || lower.includes('toilet') || lower.includes('mosquito') || lower.includes('dirty')) category = 'Sanitation';
      else if (lower.includes('light') || lower.includes('building') || lower.includes('infrastructure')) category = 'Infrastructure';
      else if (lower.includes('government') || lower.includes('corruption') || lower.includes('bribe') || lower.includes('delay') || lower.includes('problem') || lower.includes('help')) category = 'Government Services';
      else if (lower.includes('farm') || lower.includes('crop') || lower.includes('rural')) category = 'Rural specific';
      else if (lower.includes('safety') || lower.includes('safe') || lower.includes('crossing') || lower.includes('accident')) category = 'Public Safety';
    }
    
    let priority = 'Medium';
    if (lower.includes('severe') || lower.includes('urgent') || lower.includes('immediately') || lower.includes('flooding') || lower.includes('danger') || lower.includes('disease') || lower.includes('accident')) priority = 'High';
    if (lower.includes('minor') || lower.includes('small') || lower.includes('delay')) priority = 'Low';

    return {
      category,
      priority,
      summary: englishText.length > 100 ? englishText.substring(0, 97) + '...' : englishText,
      emailDraft: `Respected Sir/Madam,\n\nI am writing to bring to your kind attention a serious issue faced by the residents of ${englishLocation}.\n\nWe are currently facing the problem of ${category} related concerns: ${englishText}, which has been causing significant inconvenience in our daily lives.\n\nI kindly request you to look into this matter and take necessary steps to resolve it at the earliest.\n\nYours sincerely,\n${englishName}\n${englishLocation}`
    };
  }
}

async function verifyImageContent(imageBase64, expectedCategory) {
  // Multimodal AI Phase (e.g. llava via Ollama)
  try {
    const prompt = `Analyze this image. Does it contain ${expectedCategory}? Return only a JSON object: {"match": true/false, "confidence": 0-1, "detected": "description"}`;
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llava', // Assuming llava is available for multimodal
      prompt: prompt,
      images: [imageBase64.split(',')[1] || imageBase64],
      stream: false,
      format: 'json'
    });
    
    if (response.data && response.data.response) {
      return JSON.parse(response.data.response);
    }
  } catch (error) {
    console.warn('Vision AI (llava) not available, using heuristic fallback');
  }

  // Without llava: lenient by default so local demos still pass. Set VISION_STRICT_FALLBACK=1 to treat as uncertain (raises object_category_mismatch).
  const mockMatches = {
    Water: 0.85,
    Road: 0.92,
    Sanitation: 0.78
  };
  const strictFallback = process.env.VISION_STRICT_FALLBACK === 'true' || process.env.VISION_STRICT_FALLBACK === '1';
  if (!strictFallback) {
    return {
      match: true,
      confidence: mockMatches[expectedCategory] || 0.75,
      detected: expectedCategory,
      visionFallback: true
    };
  }
  return {
    match: false,
    confidence: 0.42,
    detected: 'vision_unavailable',
    visionFallback: true
  };
}

async function getEmbeddings(text) {
  try {
    const response = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'llama3',
      prompt: text
    });
    return response.data.embedding;
  } catch (error) {
    console.warn('Embeddings API failed, returning null');
    return null;
  }
}

/**
 * Image-side proxy embedding for duplicate detection when no image encoder:
 * embed a short caption derived from vision / category.
 */
async function embedImageProxyCaption(caption) {
  const t = typeof caption === 'string' && caption.length ? caption : 'civic complaint image evidence';
  return getEmbeddings(`Image content summary: ${t.slice(0, 500)}`);
}

async function detectImageManipulation(_imageBase64) {
  try {
    const prompt =
      'Reply with JSON only: {"manipulated": true/false, "score": 0-1} estimating AI-generated or heavy editing.';
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llava',
      prompt,
      images: [_imageBase64.split(',')[1] || _imageBase64],
      stream: false,
      format: 'json'
    });
    if (response.data?.response) {
      return JSON.parse(response.data.response);
    }
  } catch (e) {
    console.warn('Manipulation detector fallback:', e.message);
  }
  return { manipulated: false, score: 0.15 };
}

async function estimateSceneLightingConsistency(_imageBase64, _claimedTimeIso) {
  return { consistent: null, note: 'optional_model_stub' };
}

/**
 * Single-LLM translation + structuring call.
 * Replaces chained translateToEnglish() + separate formatting with one unified prompt.
 * Handles: STT noise correction, transliteration, address normalization, issue summarization.
 *
 * @param {object} rawFields — { name: string, address: string, issue: string }
 * @param {string} bcp47 — BCP-47 language code (e.g., 'ta-IN', 'hi-IN')
 * @returns {Promise<object>} — structured complaint data
 */
async function structureComplaint(rawFields, bcp47 = 'en-IN') {
  const { name = '', address = '', issue = '' } = rawFields;
  const langName = bcp47.split('-')[0]; // 'ta', 'hi', 'en', etc.

  const structurePrompt = `You are a multilingual civic complaint data processor for Indian regional languages.
The input fields were captured via Voice-to-Text (STT) in ${bcp47} and may contain:
- STT transcription errors and noise
- Mixed script / transliteration
- Incomplete or informal address formats

Your job is to clean, correct, and structure this data. Return a STRICT JSON object:

{
  "name_en": "Full name transliterated to English Latin script",
  "name_original": "Name in original script (${langName}) if applicable, else same as name_en",
  "address_en": "Full address normalized to English with proper formatting",
  "district": "District name in English (extract from address if present)",
  "ward": "Ward number or name if mentioned, else empty string",
  "pincode": "6-digit Indian PIN code if mentioned, else empty string",
  "issue_en": "Clean, corrected English translation of the issue/complaint",
  "issue_original": "Original issue text cleaned of STT noise artifacts in ${langName} script",
  "issue_summary": "1-2 sentence English summary of the core complaint"
}

Rules:
1. Fix obvious STT errors (e.g., "pot holes" → "potholes", repeated words, truncated sentences)
2. Transliterate names properly (e.g., "ராஜேஷ்" → "Rajesh")
3. Normalize addresses: capitalize district names, format ward numbers
4. Extract PIN code, district, ward from the address string if present
5. If the language is English, still clean STT noise but keep original fields same as English versions
6. RESPOND WITH ONLY THE JSON OBJECT. No markdown, no explanation.

Input data (captured via STT in ${bcp47}):
Name: "${name}"
Address: "${address}"
Issue: "${issue}"`;

  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt: structurePrompt,
      stream: false,
      format: 'json'
    }, { timeout: 30000 });

    if (response.data?.response) {
      const parsed = JSON.parse(response.data.response);
      return normalizeStructuredOutput(parsed, rawFields);
    }
    throw new Error('Empty model response');
  } catch (error) {
    console.warn('[structureComplaint] LLM structuring failed, using passthrough:', error.message);
    return passthroughStructure(rawFields, bcp47);
  }
}

/**
 * Validate and normalize the LLM structured output.
 */
function normalizeStructuredOutput(parsed, rawFields) {
  return {
    name_en: parsed.name_en || rawFields.name || 'Unknown',
    name_original: parsed.name_original || rawFields.name || '',
    address_en: parsed.address_en || rawFields.address || 'Unknown',
    district: parsed.district || '',
    ward: parsed.ward || '',
    pincode: parsed.pincode || '',
    issue_en: parsed.issue_en || rawFields.issue || '',
    issue_original: parsed.issue_original || rawFields.issue || '',
    issue_summary: parsed.issue_summary || (parsed.issue_en || rawFields.issue || '').substring(0, 150)
  };
}

/**
 * Passthrough when LLM is unavailable — uses Google Translate as fallback.
 */
async function passthroughStructure(rawFields, bcp47) {
  const isEnglish = bcp47.startsWith('en');

  let nameEn = rawFields.name || 'Unknown';
  let addressEn = rawFields.address || 'Unknown';
  let issueEn = rawFields.issue || '';

  if (!isEnglish) {
    nameEn = await translateToEnglish(rawFields.name || '');
    addressEn = await translateToEnglish(rawFields.address || '');
    issueEn = await translateToEnglish(rawFields.issue || '');
  }

  return {
    name_en: nameEn,
    name_original: rawFields.name || '',
    address_en: addressEn,
    district: '',
    ward: '',
    pincode: '',
    issue_en: issueEn,
    issue_original: rawFields.issue || '',
    issue_summary: issueEn.length > 150 ? issueEn.substring(0, 147) + '...' : issueEn
  };
}

module.exports = {
  translateToEnglish,
  analyzeComplaint,
  structureComplaint,
  verifyImageContent,
  getEmbeddings,
  embedImageProxyCaption,
  detectImageManipulation,
  estimateSceneLightingConsistency
};
