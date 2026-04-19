const { HfInference } = require('@huggingface/inference');

/**
 * Hugging Face Inference API-powered fraud detection.
 * Uses the official @huggingface/inference SDK for modern infrastructure.
 * Exports getHfFraudScore(complaintText, recentComplaints[])
 */

function getApiKey() {
  return process.env.HF_API_KEY || '';
}

async function getHfFraudScore(complaintText, recentComplaints = []) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('HF_API_KEY not set, skipping ML fraud detection');
    return { score: 0, reasons: [], embedding: null };
  }

  const hf = new HfInference(apiKey);
  const reasons = [];
  let totalScore = 0;
  let embedding = null;

  try {
    // Run models in parallel using settled promises for resilience
    const results = await Promise.allSettled([
      // 1. Zero-Shot Classifer (BART)
      hf.zeroShotClassification({
        model: 'facebook/bart-large-mnli',
        inputs: complaintText,
        parameters: {
          candidate_labels: ['genuine civic complaint', 'spam', 'fake report', 'abusive content']
        }
      }),
      // 2. Embeddings (MiniLM)
      hf.featureExtraction({
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: complaintText
      }),
      // 3. Sentiment (DistilBERT)
      hf.textClassification({
        model: 'distilbert-base-uncased-finetuned-sst-2-english',
        inputs: complaintText
      })
    ]);

    // --- Process Zero-Shot ---
    if (results[0].status === 'fulfilled') {
      const data = results[0].value;
      const genuineIdx = (data.labels || []).indexOf('genuine civic complaint');
      const genuineScore = genuineIdx >= 0 ? data.scores[genuineIdx] : 1;
      if (genuineScore < 0.4) {
        totalScore += 30;
        reasons.push(`[AI] Low sincerity: complaint unlikely genuine (${(genuineScore * 100).toFixed(1)}%)`);
      }
    }

    // --- Process Embeddings & Similarity ---
    if (results[1].status === 'fulfilled') {
      embedding = results[1].value;
      // Handle nested array if returned
      const vec = Array.isArray(embedding[0]) ? embedding[0] : embedding;
      
      for (const complaint of recentComplaints) {
        if (!complaint.textEmbedding || complaint.textEmbedding.length === 0) continue;
        const sim = cosineSimilarity(vec, complaint.textEmbedding);
        if (sim > 0.88) {
          totalScore += 40;
          reasons.push(`[AI] High semantic overlap with recent complaint (${complaint.trackingId || 'ID#123'})`);
          break; // only penalize once
        }
      }
    }

    // --- Process Sentiment ---
    if (results[2].status === 'fulfilled') {
      const sentiment = results[2].value;
      const negative = sentiment.find(r => r.label === 'NEGATIVE');
      if (negative && negative.score > 0.98 && complaintText.length < 60) {
        totalScore += 15;
        reasons.push(`[AI] High-intensity negative short text (possible rage-report)`);
      }
    }

  } catch (err) {
    console.error('[Fraud AI] Error during inference:', err.message);
  }

  return {
    score: Math.min(totalScore, 100),
    reasons,
    embedding
  };
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

module.exports = { getHfFraudScore };
