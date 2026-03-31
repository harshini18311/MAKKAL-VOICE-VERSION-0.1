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
  High: 3,
  Medium: 7,
  Low: 14
};

const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert Indian civic complaint classification agent.
Given a structured complaint, analyze it and return a STRICT JSON object with these fields:

{
  "category": "One of: Water, Road, Electricity, Infrastructure, Public Safety, Sanitation, Traffic, Government Services, Rural specific, Housing & Slum Issues, Disaster & Emergency, Animal & Wildlife Issues, Education Infrastructure, Public Amenities, Revenue & Land Issues, Documentation & Certificates, Environment & Pollution, Market & Price Issues, Women & Child Safety, Digital & Telecom Issues, Irrelevant",
  "severity": "One of: Critical, High, Medium, Low",
  "department": "The department name that should handle this",
  "departmentCode": "Short code: WTR, ROD, ELC, INF, PUB, SAN, TRF, GOV, RUR, HSG, DIS, ANM, EDU, AMN, LND, DOC, ENV, MKT, WCS, TEL, or NA",
  "estimatedResolutionDays": "Integer: 1 for Critical, 3 for High, 7 for Medium, 14 for Low",
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

  const category = validCategories.includes(raw.category) ? raw.category : 'Irrelevant';
  const severity = validSeverities.includes(raw.severity) ? raw.severity : 'Medium';
  const dept = DEPARTMENT_ROUTING[category] || DEPARTMENT_ROUTING['Government Services'];

  return {
    category,
    severity,
    department: dept.name,
    departmentCode: dept.code,
    departmentEmail: dept.email,
    estimatedResolutionDays: SEVERITY_RESOLUTION_MAP[severity] || 7,
    summaryEnglish: raw.summaryEnglish || raw.summary || structuredData.issue_en?.substring(0, 150) || '',
    formalEmailDraft: raw.formalEmailDraft || buildFallbackEmail(structuredData, category)
  };
}

/**
 * Keyword-based heuristic classifier (fallback when no LLM available).
 */
function heuristicClassify(structuredData) {
  const text = (structuredData.issue_en || '').toLowerCase();
  const name = structuredData.name_en || 'Resident';
  const location = structuredData.address_en || 'the locality';

  let category = 'Irrelevant';
  if (/water|drain|pipe|tap|irrigation|flood|leakage|contaminated/.test(text)) category = 'Water';
  else if (/road|pothole|street|transport|highway|bridge/.test(text)) category = 'Road';
  else if (/electric|power|wire|transformer|voltage|outage/.test(text)) category = 'Electricity';
  else if (/garbage|sewage|toilet|mosquito|dirty|sanitation|waste/.test(text)) category = 'Sanitation';
  else if (/traffic|signal|parking|congestion/.test(text)) category = 'Traffic';
  else if (/light|building|infrastructure|construction/.test(text)) category = 'Infrastructure';
  else if (/government|corruption|bribe|delay|official/.test(text)) category = 'Government Services';
  else if (/farm|crop|rural|cattle|animal|stray/.test(text)) category = 'Rural specific';
  else if (/cyclone|landslide|rescue|disaster|emergency/.test(text)) category = 'Disaster & Emergency';
  else if (/danger|accident|safe|collapse|hazard/.test(text)) category = 'Public Safety';
  else if (/slum|housing|eviction|encroachment|resettlement/.test(text)) category = 'Housing & Slum Issues';
  else if (/dog|monkey|snake|wildlife|cruelty/.test(text)) category = 'Animal & Wildlife Issues';
  else if (/school|teacher|education|midday|student/.test(text)) category = 'Education Infrastructure';
  else if (/park|bus stop|bench|shelter|amenity/.test(text)) category = 'Public Amenities';
  else if (/patta|land|dispute|grab|survey/.test(text)) category = 'Revenue & Land Issues';
  else if (/aadhaar|ration|certificate|birth|death|name correction/.test(text)) category = 'Documentation & Certificates';
  else if (/pollution|air|noise|tree|environment/.test(text)) category = 'Environment & Pollution';
  else if (/price|overprice|market|quality|black market/.test(text)) category = 'Market & Price Issues';
  else if (/women|child|harass|safety|missing|labor/.test(text)) category = 'Women & Child Safety';
  else if (/mobile|signal|internet|telecom|tower|network/.test(text)) category = 'Digital & Telecom Issues';
  else category = 'Irrelevant';

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
    estimatedResolutionDays: SEVERITY_RESOLUTION_MAP[severity] || 7,
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
