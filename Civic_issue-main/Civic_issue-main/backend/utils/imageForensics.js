const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 15000 }, (error, stdout, stderr) => {
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
    
    const response = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: base64Image
      }),
      timeout: 5000 // 5 second timeout
    });

    if (!response.ok) {
      console.warn(`HF image captioning failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const result = await response.json();
    
    // Hugging Face returns array of results with 'generated_text'
    if (Array.isArray(result) && result[0]?.generated_text) {
      return result[0].generated_text;
    }

    console.warn('HF API returned unexpected format');
    return null;
  } catch (error) {
    console.warn('Image caption generation error:', error.message);
    return null;
  }
}

async function runForensicsScript(imagePath) {
  const scriptPath = path.join(__dirname, 'image_forensics.py');
  const pythonCandidates = [
    [process.env.PYTHON_BIN || 'python', [scriptPath, imagePath]],
    ['py', ['-3', scriptPath, imagePath]]
  ];

  for (const [cmd, args] of pythonCandidates) {
    try {
      const output = await execFileAsync(cmd, args);
      return JSON.parse(output);
    } catch (err) {
      // Try next candidate.
    }
  }

  return {
    ok: false,
    error: 'Python image forensics script could not be executed. Install Python dependencies and ensure python is in PATH.'
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
