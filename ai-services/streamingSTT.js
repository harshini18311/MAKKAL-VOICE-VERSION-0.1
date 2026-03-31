/**
 * Streaming Speech-to-Text handler for Twilio WebSocket media streams.
 * Receives μ-law audio → decodes → VAD trims → sends to Whisper API.
 * Returns transcription with confidence per segment.
 */

const axios = require('axios');
const FormData = require('form-data');
const { VoiceActivityDetector, decodeMulaw } = require('./vadService');

// WAV header for 8kHz 16-bit mono PCM
function buildWavHeader(dataLength) {
  const header = Buffer.alloc(44);
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const channels = 1;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);        // PCM format chunk size
  header.writeUInt16LE(1, 20);         // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

// Mock transcriptions for offline demo
let mockIdx = 0;
const MOCK_RESPONSES = [
  { text: 'Rajesh Kumar', confidence: 0.92 },
  { text: 'Ward 12, Thiruvanmiyur, Chennai', confidence: 0.88 },
  { text: 'The road has many potholes and water logging during rain', confidence: 0.85 },
  { text: 'Lakshmi Devi', confidence: 0.90 },
  { text: 'Perambur, Zone 5, North Chennai', confidence: 0.87 },
  { text: 'Street lights not working for two weeks', confidence: 0.91 }
];

/**
 * Transcribe a PCM buffer using Whisper API.
 * @param {Buffer} pcmBuffer — PCM 16-bit LE 8kHz mono
 * @param {string} whisperCode — language code for Whisper (e.g., 'ta', 'hi', 'en')
 * @returns {Promise<{ text: string, confidence: number }>}
 */
async function transcribeSegment(pcmBuffer, whisperCode = 'en') {
  if (!process.env.OPENAI_API_KEY) {
    // Mock mode for demos
    console.log(`[StreamingSTT] Mock mode — no OPENAI_API_KEY`);
    await new Promise(r => setTimeout(r, 800));
    const mock = MOCK_RESPONSES[mockIdx % MOCK_RESPONSES.length];
    mockIdx++;
    return { text: mock.text, confidence: mock.confidence };
  }

  try {
    const wavHeader = buildWavHeader(pcmBuffer.length);
    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

    const form = new FormData();
    form.append('file', wavBuffer, {
      filename: 'segment.wav',
      contentType: 'audio/wav'
    });
    form.append('model', 'whisper-1');
    form.append('language', whisperCode);
    form.append('response_format', 'verbose_json');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        timeout: 15000
      }
    );

    const data = response.data;
    // Whisper verbose_json returns segments with avg_logprob
    const avgLogprob = data.segments?.[0]?.avg_logprob ?? -0.3;
    // Convert log probability to 0-1 confidence (heuristic)
    const confidence = Math.min(1, Math.max(0, 1 + avgLogprob));

    return {
      text: data.text?.trim() || '',
      confidence: Math.round(confidence * 100) / 100
    };
  } catch (error) {
    console.error('[StreamingSTT] Whisper API error:', error.message);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Create a streaming STT session that processes Twilio WebSocket media events.
 * @param {string} whisperCode — language code
 * @returns {{ handleMessage: Function, getTranscripts: Function, destroy: Function }}
 */
function createStreamingSession(whisperCode = 'en') {
  const vad = new VoiceActivityDetector();
  const transcripts = [];
  let streamSid = null;
  let callSid = null;
  let resolveWait = null;
  let destroyed = false;

  // When VAD detects a speech segment, queue transcription
  vad.on('speech', async (pcmBuffer, meta) => {
    if (destroyed) return;
    try {
      console.log(`[StreamingSTT] Speech segment: ${meta.durationMs}ms, RMS: ${Math.round(meta.rmsEnergy)}`);
      const result = await transcribeSegment(pcmBuffer, whisperCode);
      transcripts.push({
        ...result,
        durationMs: meta.durationMs,
        timestamp: Date.now()
      });
      if (resolveWait) {
        resolveWait(result);
        resolveWait = null;
      }
    } catch (err) {
      console.error('[StreamingSTT] Segment transcription error:', err.message);
    }
  });

  return {
    /**
     * Handle a Twilio WebSocket message.
     * @param {object} msg — parsed JSON from Twilio stream
     */
    handleMessage(msg) {
      if (destroyed) return;

      switch (msg.event) {
        case 'connected':
          console.log('[StreamingSTT] Stream connected');
          break;

        case 'start':
          streamSid = msg.start?.streamSid;
          callSid = msg.start?.callSid;
          console.log(`[StreamingSTT] Stream started — SID: ${streamSid}, Call: ${callSid}`);
          break;

        case 'media': {
          // Twilio sends base64-encoded μ-law audio
          const payload = msg.media?.payload;
          if (payload) {
            const mulaw = Buffer.from(payload, 'base64');
            const pcm = decodeMulaw(mulaw);
            vad.feed(pcm);
          }
          break;
        }

        case 'stop':
          console.log('[StreamingSTT] Stream stopped');
          vad.flush();
          break;

        default:
          break;
      }
    },

    /**
     * Wait for the next speech segment transcription.
     * @param {number} timeoutMs — max wait time
     * @returns {Promise<{ text: string, confidence: number } | null>}
     */
    waitForNextTranscript(timeoutMs = 35000) {
      return new Promise((resolve) => {
        resolveWait = resolve;
        setTimeout(() => {
          if (resolveWait === resolve) {
            resolveWait = null;
            resolve(null);
          }
        }, timeoutMs);
      });
    },

    /**
     * Get all transcripts collected so far.
     */
    getTranscripts() {
      return [...transcripts];
    },

    /**
     * Get stream metadata.
     */
    getMetadata() {
      return { streamSid, callSid };
    },

    /**
     * Flush VAD and clean up.
     */
    destroy() {
      destroyed = true;
      vad.flush();
      vad.removeAllListeners();
    }
  };
}

module.exports = { transcribeSegment, createStreamingSession, buildWavHeader };
