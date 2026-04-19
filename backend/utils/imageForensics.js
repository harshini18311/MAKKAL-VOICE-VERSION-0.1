const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Generate image caption using Hugging Face Vision-to-Text API
 * Returns caption or "no_caption_generated" as fallback
 */
async function generateImageCaption(photoBuffer) {
  try {
    if (!process.env.HF_API_KEY) {
      console.warn('HF_API_KEY not set - skipping image captioning');
      return null;
    }

    const base64Image = photoBuffer.toString('base64');
    
    const response = await fetch('https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: base64Image
      }),
      timeout: 10000 // Extended timeout
    });

    if (!response.ok) {
      console.warn(`HF image captioning failed: ${response.status} ${response.statusText}`);
      return "";
    }

    const result = await response.json();
    
    if (Array.isArray(result) && result[0]?.generated_text) {
      return result[0].generated_text;
    }

    console.warn('HF API returned unexpected format');
    return "";
  } catch (error) {
    console.warn('Image caption generation error:', error.message);
    return "";
  }
}

async function runForensicsScript(imagePath) {
  const scriptPath = path.join(__dirname, 'image_forensics.py');
  const pythonCandidates = [
    [process.env.PYTHON_BIN || 'python', [scriptPath, imagePath]],
    ['py', ['-3', scriptPath, imagePath]]
  ];

  let lastError = null;
  for (const [cmd, args] of pythonCandidates) {
    try {
      const output = await execFileAsync(cmd, args);
      return JSON.parse(output);
    } catch (err) {
      console.warn(`[Python] Candidate ${cmd} failed:`, err.message);
      lastError = err.message;
      // Try next candidate.
    }
  }

  return {
    ok: false,
    error: `Python image forensics script could not be executed. Details: ${lastError}`
  };
}

async function inspectComplaintPhoto(photoBuffer) {
  const tmpPath = path.join(os.tmpdir(), `complaint-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
  try {
    fs.writeFileSync(tmpPath, photoBuffer);
    const forensicsResult = await runForensicsScript(tmpPath);
    
    // Add caption from AI analysis
    let caption = null;
    try {
      caption = await generateImageCaption(photoBuffer);
    } catch (err) {
      console.warn('Caption generation skipped:', err.message);
    }

    return {
      ...forensicsResult,
      caption: caption || 'Unable to generate caption'
    };
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

module.exports = { inspectComplaintPhoto, generateImageCaption };
