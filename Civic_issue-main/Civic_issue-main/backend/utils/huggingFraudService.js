const axios = require('axios');

const HF_API_URL = 'https://api-inference.huggingface.co/models';

/**
 * Hugging Face Inference API-powered fraud detection.
 * Runs 4 models via Promise.allSettled() for resilient execution.
 * Exports getHfFraudScore(complaintText, recentComplaints[])
 */

function getApiKey() {
  return process.env.HF_API_KEY || '';
}

function hfHeaders() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json'
  };
}

// ─── Model 1: facebook/bart-large-mnli (Zero-shot classification) ───

async function checkZeroShot(text) {
  const response = await axios.post(
    `${HF_API_URL}/facebook/bart-large-mnli`,
    {
      inputs: text,
      parameters: {
        candidate_labels: ['genuine civic complaint', 'spam', 'fake report', 'abusive content']
      }
    },
    { headers: hfHeaders(), timeout: 15000 }
  );

  const data = response.data;
  const genuineIdx = (data.labels || []).indexOf('genuine civic complaint');
  const genuineScore = genuineIdx >= 0 ? data.scores[genuineIdx] : 1;

  if (genuineScore < 0.5) {
    return { score: 25, reason: '[AI] Zero-shot classifier: complaint unlikely genuine (confidence ' + (genuineScore * 100).toFixed(1) + '%)' };
  }
  return { score: 0, reason: null };
}

// ─── Model 2: sentence-transformers/all-MiniLM-L6-v2 (Semantic similarity) ───

async function getEmbedding(text) {
  const response = await axios.post(
    `${HF_API_URL}/sentence-transformers/all-MiniLM-L6-v2`,
    { inputs: text, options: { wait_for_model: true } },
    { headers: hfHeaders(), timeout: 15000 }
  );
  return response.data;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return (magA && magB) ? dot / (magA * magB) : 0;
}

async function checkSemanticSimilarity(text, recentComplaints) {
  const embedding = await getEmbedding(text);
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return { score: 0, reason: null, embedding: null };
  }

  // The API may return nested array [[...values...]] or flat array
  const vec = Array.isArray(embedding[0]) ? embedding[0] : embedding;

  for (const complaint of recentComplaints) {
    if (!complaint.textEmbedding || complaint.textEmbedding.length === 0) continue;
    const sim = cosineSimilarity(vec, complaint.textEmbedding);
    if (sim > 0.85) {
      return {
        score: 30,
        reason: `[AI] Semantic similarity: ${(sim * 100).toFixed(1)}% match with recent complaint (${complaint.trackingId || 'unknown'})`,
        embedding: vec
      };
    }
  }
  return { score: 0, reason: null, embedding: vec };
}

// ─── Model 3: dslim/bert-base-NER (Named Entity Recognition) ───

async function checkNER(text) {
  const response = await axios.post(
    `${HF_API_URL}/dslim/bert-base-NER`,
    { inputs: text, options: { wait_for_model: true } },
    { headers: hfHeaders(), timeout: 15000 }
  );

  const entities = response.data || [];
  const locationEntities = entities.filter(e => e.entity_group === 'LOC' || e.entity === 'B-LOC' || e.entity === 'I-LOC');

  if (locationEntities.length === 0) {
    return { score: 15, reason: '[AI] NER analysis: no specific location mentioned in complaint text' };
  }
  return { score: 0, reason: null };
}

// ─── Model 4: distilbert-base-uncased-finetuned-sst-2-english (Sentiment) ───

async function checkSentiment(text) {
  const response = await axios.post(
    `${HF_API_URL}/distilbert-base-uncased-finetuned-sst-2-english`,
    { inputs: text, options: { wait_for_model: true } },
    { headers: hfHeaders(), timeout: 15000 }
  );

  const results = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!Array.isArray(results)) return { score: 0, reason: null };

  const negative = results.find(r => r.label === 'NEGATIVE');
  if (negative && negative.score > 0.95 && text.length < 80) {
    return {
      score: 10,
      reason: '[AI] Sentiment analysis: high-confidence negative short text (rage-bait signal, ' + (negative.score * 100).toFixed(1) + '%)'
    };
  }
  return { score: 0, reason: null };
}

// ─── Main export ───

async function getHfFraudScore(complaintText, recentComplaints = []) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('HF_API_KEY not set, using rule-based fraud only');
    return { score: 0, reasons: [], embedding: null };
  }

  const results = await Promise.allSettled([
    checkZeroShot(complaintText),
    checkSemanticSimilarity(complaintText, recentComplaints),
    checkNER(complaintText),
    checkSentiment(complaintText)
  ]);

  let totalScore = 0;
  const reasons = [];
  let embedding = null;

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      totalScore += result.value.score || 0;
      if (result.value.reason) reasons.push(result.value.reason);
      if (result.value.embedding) embedding = result.value.embedding;
    }
    // Rejected promises are silently skipped per spec
  }

  return {
    score: Math.min(totalScore, 100),
    reasons,
    embedding
  };
}

module.exports = { getHfFraudScore };
