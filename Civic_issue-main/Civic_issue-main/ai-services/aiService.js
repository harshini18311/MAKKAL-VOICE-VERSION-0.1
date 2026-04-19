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

  const prompt = `
  You are an AI assistant analyzing rural civic complaints.
  Read the following complaint and output a pure JSON object with these keys:
  - "category": One of ["Water", "Road", "Electricity", "Infrastructure", "Public Safety", "Sanitation", "Traffic", "Government Services", "Rural specific", "Other"].
  - "priority": One of ["Low", "Medium", "High"].
  - "summary": A short 1-2 sentence summary in English.
  - "emailDraft": A professional formal email following this EXACT format:
    Respected Sir/Madam,
    I am writing to bring to your kind attention a serious issue faced by the residents of ${location}.
    We are currently facing the problem of [DESCRIBE ISSUE], which has been causing significant inconvenience in our daily lives. This issue has persisted for some time and has not yet been resolved despite affecting many people in the locality.
    Due to this problem, residents are experiencing difficulties such as [IMPACT]. Immediate action is required to prevent further complications.
    I kindly request you to look into this matter and take necessary steps to resolve it at the earliest. Your prompt action will be greatly appreciated by all residents of the area.
    Thank you for your attention to this matter.
    Yours sincerely,
    ${name}
    ${location}
  
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
    let category = 'Other';
    if (lower.includes('water') || lower.includes('drain') || lower.includes('pipe') || lower.includes('tap') || lower.includes('irrigation')) category = 'Water';
    else if (lower.includes('road') || lower.includes('street') || lower.includes('pothole') || lower.includes('transport') || lower.includes('traffic') || lower.includes('parking')) category = 'Road';
    else if (lower.includes('electric') || lower.includes('power') || lower.includes('wire') || lower.includes('transformer')) category = 'Electricity';
    else if (lower.includes('garbage') || lower.includes('sewage') || lower.includes('dog') || lower.includes('animal') || lower.includes('toilet') || lower.includes('mosquito') || lower.includes('dirty')) category = 'Sanitation';
    else if (lower.includes('light') || lower.includes('building') || lower.includes('infrastructure')) category = 'Infrastructure';
    else if (lower.includes('government') || lower.includes('corruption') || lower.includes('bribe') || lower.includes('delay')) category = 'Government Services';
    else if (lower.includes('farm') || lower.includes('crop') || lower.includes('rural')) category = 'Rural specific';
    else if (lower.includes('safety') || lower.includes('safe') || lower.includes('crossing') || lower.includes('accident')) category = 'Public Safety';
    
    let priority = 'Medium';
    if (lower.includes('severe') || lower.includes('urgent') || lower.includes('immediately') || lower.includes('flooding') || lower.includes('danger') || lower.includes('disease') || lower.includes('accident')) priority = 'High';
    if (lower.includes('minor') || lower.includes('small') || lower.includes('delay')) priority = 'Low';

    return {
      category,
      priority,
      summary: englishText.length > 100 ? englishText.substring(0, 97) + '...' : englishText,
      emailDraft: `Respected Sir/Madam,\n\nI am writing to bring to your kind attention a serious issue faced by the residents of ${location}.\n\nWe are currently facing the problem of ${category} related concerns: ${englishText}, which has been causing significant inconvenience in our daily lives.\n\nI kindly request you to look into this matter and take necessary steps to resolve it at the earliest.\n\nYours sincerely,\n${name}\n${location}`
    };
  }
}

module.exports = { analyzeComplaint };
