const OpenAI = require('openai');
const { optimizeVisualQuery } = require('./queryOptimizer');

/**
 * Advanced GPT-4o-mini Vision Integration
 * Replaces CLIP for >90% accuracy in civic complaint verification.
 * Automatically identifies if the image matches the description.
 */

async function getClipAlignmentScore(photoBuffer, complaintText) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[AI Vision] No OPENAI_API_KEY found, skipping vision alignment');
      return null;
    }

    const openai = new OpenAI({ apiKey });

    if (!photoBuffer || !complaintText || complaintText.trim().length === 0) {
      return null;
    }

    // 1. Optimize visual query (optional, GPT-4o is good with noise but this helps focus)
    const visualQuery = optimizeVisualQuery(complaintText);
    const base64Image = photoBuffer.toString('base64');

    // 2. High-Accuracy Multi-Modal Verification
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a civic evidence validator for "Makkal Voice". 
          Your task: Check if the provided photo shows the specific civic issue described.
          Output JSON only: { "alignmentScore": 0-100, "unrelatedScore": 0-100, "isFake": boolean, "reason": "short explanation" }`
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Complaint: "${complaintText}"\nVisual Target: "${visualQuery}"` },
            {
              type: "image_url",
              image_url: {
                "url": `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      alignmentScore: result.alignmentScore,
      unrelatedScore: result.unrelatedScore,
      optimizedQuery: visualQuery,
      aiReason: result.reason,
      isAiFake: result.isFake
    };

  } catch (error) {
    console.error('[AI Vision] OpenAI Error:', error.message);
    return null;
  }
}

module.exports = { getClipAlignmentScore };
