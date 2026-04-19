/**
 * Classification Agent — second LLM call for complaint enrichment.
 * Takes structured complaint JSON and produces:
 *   - category (from standard enum)
 *   - department routing code
 *   - severity (Critical / High / Medium / Low)
 *   - estimatedResolutionDays
 *   - formalEmailDraft
 */

const axios = require('axios');

const DEPARTMENT_ROUTING = {
  Water: { code: 'WTR', name: 'Water Supply & Sewerage Board', email: 'cmwssb@tn.gov.in' },
  Road: { code: 'ROD', name: 'Road & Infrastructure Dept', email: 'complaints@chennaicorporation.gov.in' },
  Electricity: { code: 'ELC', name: 'Electricity Distribution Board', email: 'tangedco@tnebnet.org' },
  Sanitation: { code: 'SAN', name: 'Sanitation & Health Dept', email: 'complaints@chennaicorporation.gov.in' },
  Traffic: { code: 'TRF', name: 'Traffic & Road Safety Dept', email: 'traffic@chennaipolice.gov.in' },
  'Public Safety': { code: 'PUB', name: 'Public Safety Authority', email: 'traffic@chennaipolice.gov.in' },
  Infrastructure: { code: 'INF', name: 'Rural Development Dept', email: 'rd@tn.gov.in' },
  'Government Services': { code: 'GOV', name: 'Government Services Dept', email: 'rd@tn.gov.in' },
  'Rural specific': { code: 'RUR', name: 'Rural Development Dept', email: 'rd@tn.gov.in' },
  'Housing & Slum Issues': { code: 'HSG', name: 'Housing & Urban Development', email: 'housing@tn.gov.in' },
  'Disaster & Emergency': { code: 'DIS', name: 'Disaster Management Authority', email: 'tncra.tndrra@tn.gov.in' },
  'Animal & Wildlife Issues': { code: 'ANM', name: 'Forest & Wildlife Dept', email: 'forests@tn.gov.in' },
  'Education Infrastructure': { code: 'EDU', name: 'School Education Dept', email: 'tn.schedu@tn.gov.in' },
  'Public Amenities': { code: 'AMN', name: 'Municipal Administration', email: 'cma.tn@nic.in' },
  'Revenue & Land Issues': { code: 'LND', name: 'Revenue Administration Dept', email: 'revenue@tn.gov.in' },
  'Documentation & Certificates': { code: 'DOC', name: 'E-Sevai & Certificates Dept', email: 'esevai@tn.gov.in' },
  'Environment & Pollution': { code: 'ENV', name: 'Pollution Control Board', email: 'tnpcb@tn.gov.in' },
  'Market & Price Issues': { code: 'MKT', name: 'Civil Supplies & Consumer Protection', email: 'consumer@tn.gov.in' },
  'Women & Child Safety': { code: 'WCS', name: 'Social Welfare & Women Empowerment', email: 'swd@tn.gov.in' },
  'Digital & Telecom Issues': { code: 'TEL', name: 'Information Technology Dept', email: 'itsec@tn.gov.in' },
  'Irrelevant': { code: 'NA', name: 'Not Applicable', email: '' }
};

const SEVERITY_RESOLUTION_MAP = {
  Critical: 1,
  High: 1,
  Medium: 1,
  Low: 3
};

const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert Indian civic complaint classification agent.
Given a structured complaint, analyze it and return a STRICT JSON object with these fields:

{
  "category": "One of: Water, Road, Electricity, Infrastructure, Public Safety, Sanitation, Traffic, Government Services, Rural specific, Housing & Slum Issues, Disaster & Emergency, Animal & Wildlife Issues, Education Infrastructure, Public Amenities, Revenue & Land Issues, Documentation & Certificates, Environment & Pollution, Market & Price Issues, Women & Child Safety, Digital & Telecom Issues, Irrelevant",
  "severity": "One of: Critical, High, Medium, Low",
  "department": "The department name that should handle this",
  "departmentCode": "Short code: WTR, ROD, ELC, INF, PUB, SAN, TRF, GOV, RUR, HSG, DIS, ANM, EDU, AMN, LND, DOC, ENV, MKT, WCS, TEL, or NA",
  "estimatedResolutionDays": "Integer: 1 for Critical/High/Medium, 3 for Low",
  "summaryEnglish": "A clear 1-2 sentence summary in English",
  "formalEmailDraft": "A professional formal complaint email in English (see format below)"
}

CRITICAL INSTRUCTION: If the complaint text is completely off-topic, not a civic issue, or entirely unclear (e.g. "hello", "test", "i want a job", random noise), you MUST classify "category" as "Irrelevant" and "departmentCode" as "NA".

Severity guidelines:
- Critical: Immediate danger to life/health (flooding, electric hazard, contaminated water, structural collapse)
- High: Significant disruption to daily life (no water for days, major road damage, power outage)
- Medium: Ongoing inconvenience (potholes, irregular garbage, poor lighting)
- Low: Minor issues (cosmetic damage, minor delays, suggestions)

Email format — MUST follow exactly:
Respected Sir/Madam,

I am writing to bring to your kind attention a serious issue faced by the residents of [LOCATION].

We are currently facing the problem of [DETAILED ISSUE DESCRIPTION]. This issue has been causing significant inconvenience and [IMPACT ON RESIDENTS]. This has persisted for some time and requires urgent attention.

Due to this problem, residents are experiencing [SPECIFIC DIFFICULTIES]. Immediate action is required to prevent further complications.

I kindly request you to look into this matter and take necessary steps to resolve it at the earliest.

Thank you for your attention to this matter.

Yours sincerely,
[COMPLAINANT NAME]
[LOCATION]

RESPOND WITH ONLY THE JSON OBJECT. No markdown, no explanation.`;

/**
 * Classify a structured complaint using LLM (Ollama local or OpenAI).
 * @param {object} structuredData — output from structureComplaint()
 * @returns {Promise<object>} — classification result with all enrichment fields
 */
async function classifyComplaint(structuredData) {
  const {
    name_en = 'Resident',
    address_en = 'the locality',
    issue_en = '',
    district = '',
    ward = ''
  } = structuredData;

  const complaintContext = `
Complainant: ${name_en}
Location: ${address_en}${district ? ', ' + district : ''}${ward ? ', Ward ' + ward : ''}
Issue: ${issue_en}
  `.trim();

  try {
    // Try local Ollama first
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      system: CLASSIFICATION_SYSTEM_PROMPT,
      prompt: `Classify this complaint:\n\n${complaintContext}`,
      stream: false,
      format: 'json'
    }, { timeout: 30000 });

    if (response.data?.response) {
      const result = JSON.parse(response.data.response);
      return normalizeClassification(result, structuredData);
    }
    throw new Error('Empty model response');
  } catch (error) {
    console.warn('[ClassificationAgent] LLM classification failed, using heuristic fallback:', error.message);
    return heuristicClassify(structuredData);
  }
}

/**
 * Normalize and validate classification output.
 */
function normalizeClassification(raw, structuredData) {
  const validCategories = [
    'Water', 'Road', 'Electricity', 'Infrastructure', 'Public Safety', 'Sanitation', 
    'Traffic', 'Government Services', 'Rural specific', 'Housing & Slum Issues',
    'Disaster & Emergency', 'Animal & Wildlife Issues', 'Education Infrastructure',
    'Public Amenities', 'Revenue & Land Issues', 'Documentation & Certificates',
    'Environment & Pollution', 'Market & Price Issues', 'Women & Child Safety',
    'Digital & Telecom Issues', 'Irrelevant'
  ];
  const validSeverities = ['Critical', 'High', 'Medium', 'Low'];

  let category = validCategories.includes(raw.category) ? raw.category : 'Irrelevant';
  
  // OVERRIDE: If LLM says "Irrelevant", check for regional keywords in BOTH original and translated text
  if (category === 'Irrelevant') {
    const combinedText = ` ${structuredData.issue_en} ${structuredData.issue_original} `.toLowerCase();
    if (/தண்ணீர்|குழாய்|பைப்|water|drain|pipe|tap|irrigation/.test(combinedText)) category = 'Water';
    else if (/சாலை|ரோடு|குழி|road|pothole|street|transport/.test(combinedText)) category = 'Road';
    else if (/மின்சாரம்|கரண்ட்|electric|power|wire|transformer/.test(combinedText)) category = 'Electricity';
    else if (/குப்பை|சாக்கடை|garbage|sewage|toilet|dirty|sanitation/.test(combinedText)) category = 'Sanitation';
    else if (/கட்டிடம்|infra|light|building|construction/.test(combinedText)) category = 'Infrastructure';
    else if (category === 'Irrelevant' && combinedText.trim().length > 10) category = 'Government Services';
  }

  const severity = validSeverities.includes(raw.severity) ? raw.severity : 'Medium';
  const dept = DEPARTMENT_ROUTING[category] || DEPARTMENT_ROUTING['Government Services'];

  return {
    category,
    severity,
    department: dept.name,
    departmentCode: dept.code,
    departmentEmail: dept.email,
    estimatedResolutionDays: SEVERITY_RESOLUTION_MAP[severity] || 1,
    summaryEnglish: raw.summaryEnglish || raw.summary || structuredData.issue_en?.substring(0, 150) || '',
    formalEmailDraft: raw.formalEmailDraft || buildFallbackEmail(structuredData, category)
  };
}

/**
 * Keyword-based heuristic classifier (fallback when no LLM available).
 * Now supports Tamil keywords.
 */
function heuristicClassify(structuredData) {
  const textEn = (structuredData.issue_en || '').toLowerCase();
  const textOrig = (structuredData.issue_original || '').toLowerCase();
  const text = ` ${textEn} ${textOrig} `;

  let category = 'Irrelevant';
  
  // Water
  if (/water|drain|pipe|tap|irrigation|flood|leakage|தண்ணீர்|குழாய்|பைப்|கால்வாய்|கழிவுநீர்/.test(text)) category = 'Water';
  // Road
  else if (/road|pothole|street|transport|highway|bridge|சாலை|ரோடு|குழி|பாதை/.test(text)) category = 'Road';
  // Electricity
  else if (/electric|power|wire|transformer|voltage|outage|மின்சாரம்|கரண்ட்|ஒயர்|லைட்/.test(text)) category = 'Electricity';
  // Sanitation
  else if (/garbage|sewage|toilet|mosquito|dirty|sanitation|waste|குப்பை|சாக்கடை|நாய்|கழிவு/.test(text)) category = 'Sanitation';
  // Traffic
  else if (/traffic|signal|parking|congestion|போக்குவரத்து/.test(text)) category = 'Traffic';
  // Infrastructure
  else if (/light|building|infrastructure|construction|கட்டிடம்|பாலம்|சுவர்/.test(text)) category = 'Infrastructure';
  // Rural specific
  else if (/farm|crop|rural|cattle|animal|stray|விவசாயம்|பயிர்|மாடு/.test(text)) category = 'Rural specific';
  // Government Services
  else if (/government|corruption|bribe|delay|official|அரசு|ஊழல்|தாமதம்/.test(text)) category = 'Government Services';
  else if (text.trim().length > 15) category = 'Government Services'; // Final catch-all for long valid text

  let severity = 'Medium';
  if (/flood|danger|collapse|hazard|contaminated|accident|fire|death|immediate/.test(text)) severity = 'Critical';
  else if (/severe|urgent|broken|days|no supply|outage|major/.test(text)) severity = 'High';
  else if (/minor|small|cosmetic|suggestion/.test(text)) severity = 'Low';

  const dept = DEPARTMENT_ROUTING[category] || DEPARTMENT_ROUTING['Government Services'];

  return {
    category,
    severity,
    department: dept.name,
    departmentCode: dept.code,
    departmentEmail: dept.email,
    estimatedResolutionDays: SEVERITY_RESOLUTION_MAP[severity] || 1,
    summaryEnglish: text.length > 100 ? text.substring(0, 97) + '...' : text,
    formalEmailDraft: buildFallbackEmail(structuredData, category)
  };
}

/**
 * Build fallback email when LLM doesn't produce one.
 */
function buildFallbackEmail(structuredData, category) {
  const name = structuredData.name_en || 'Resident';
  const location = structuredData.address_en || 'the locality';
  const issue = structuredData.issue_en || 'a civic issue';

  return `Respected Sir/Madam,

I am writing to bring to your kind attention a serious issue faced by the residents of ${location}.

We are currently facing the problem of ${category.toLowerCase()} related concerns: ${issue}. This has been causing significant inconvenience in our daily lives. This issue has persisted for some time and has not yet been resolved despite affecting many people in the locality.

Due to this problem, residents are experiencing difficulties and hardships. Immediate action is required to prevent further complications.

I kindly request you to look into this matter and take necessary steps to resolve it at the earliest. Your prompt action will be greatly appreciated by all residents of the area.

Thank you for your attention to this matter.

Yours sincerely,
${name}
${location}`;
}

module.exports = {
  classifyComplaint,
  heuristicClassify,
  DEPARTMENT_ROUTING,
  SEVERITY_RESOLUTION_MAP
};
