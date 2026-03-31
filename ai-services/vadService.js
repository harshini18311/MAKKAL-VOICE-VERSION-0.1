/**
 * Voice Activity Detection (VAD) — energy-based silence trimming
 * Operates on raw PCM (16-bit LE, 8kHz) frames from Twilio μ-law decode.
 *
 * Usage:
 *   const vad = new VoiceActivityDetector(options);
 *   vad.on('speech', (pcmBuffer) => { ... });
 *   vad.on('silence', () => { ... });
 *   vad.feed(pcmChunk);
 *   vad.flush();
 */

const { EventEmitter } = require('events');

// Default thresholds tuned for telephony (8kHz μ-law → PCM)
const DEFAULTS = {
  silenceThreshold: 500,       // RMS energy below this = silence
  minSpeechMs: 250,            // Minimum speech duration to emit (ignore clicks/pops)
  silenceTimeoutMs: 1200,      // Silence duration to mark end of speech segment
  sampleRate: 8000,            // Twilio default
  bytesPerSample: 2,           // 16-bit PCM
  maxSegmentMs: 30000          // Safety cap — flush after 30s continuous speech
};

class VoiceActivityDetector extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.config = { ...DEFAULTS, ...opts };
    this._speechBuffer = [];
    this._speechStartTime = null;
    this._silenceStartTime = null;
    this._isSpeaking = false;
    this._totalSpeechBytes = 0;
  }

  /**
   * Calculate RMS energy of a PCM 16-bit LE buffer.
   */
  _rms(pcmBuffer) {
    if (!pcmBuffer || pcmBuffer.length < 2) return 0;
    let sum = 0;
    const sampleCount = Math.floor(pcmBuffer.length / 2);
    for (let i = 0; i < sampleCount; i++) {
      const sample = pcmBuffer.readInt16LE(i * 2);
      sum += sample * sample;
    }
    return Math.sqrt(sum / sampleCount);
  }

  /**
   * Feed a PCM chunk into the VAD.
   * @param {Buffer} pcmChunk — raw PCM 16-bit LE audio
   */
  feed(pcmChunk) {
    if (!Buffer.isBuffer(pcmChunk) || pcmChunk.length === 0) return;

    const energy = this._rms(pcmChunk);
    const now = Date.now();

    if (energy >= this.config.silenceThreshold) {
      // Speech detected
      this._silenceStartTime = null;

      if (!this._isSpeaking) {
        this._isSpeaking = true;
        this._speechStartTime = now;
        this._speechBuffer = [];
        this._totalSpeechBytes = 0;
      }

      this._speechBuffer.push(pcmChunk);
      this._totalSpeechBytes += pcmChunk.length;

      // Safety cap: flush if segment too long
      const durationMs = (this._totalSpeechBytes / this.config.bytesPerSample) / this.config.sampleRate * 1000;
      if (durationMs >= this.config.maxSegmentMs) {
        this._emitSpeech();
      }
    } else {
      // Silence detected
      if (this._isSpeaking) {
        // Keep buffering during brief pauses
        this._speechBuffer.push(pcmChunk);
        this._totalSpeechBytes += pcmChunk.length;

        if (!this._silenceStartTime) {
          this._silenceStartTime = now;
        }

        const silenceDuration = now - this._silenceStartTime;
        if (silenceDuration >= this.config.silenceTimeoutMs) {
          this._emitSpeech();
          this.emit('silence');
        }
      }
    }
  }

  /**
   * Emit buffered speech if it meets minimum duration.
   */
  _emitSpeech() {
    if (this._speechBuffer.length === 0) {
      this._reset();
      return;
    }

    const combined = Buffer.concat(this._speechBuffer);
    const durationMs = (combined.length / this.config.bytesPerSample) / this.config.sampleRate * 1000;

    if (durationMs >= this.config.minSpeechMs) {
      this.emit('speech', combined, {
        durationMs: Math.round(durationMs),
        rmsEnergy: this._rms(combined)
      });
    }

    this._reset();
  }

  _reset() {
    this._speechBuffer = [];
    this._speechStartTime = null;
    this._silenceStartTime = null;
    this._isSpeaking = false;
    this._totalSpeechBytes = 0;
  }

  /**
   * Flush any remaining speech buffer (call on stream end).
   */
  flush() {
    if (this._isSpeaking && this._speechBuffer.length > 0) {
      this._emitSpeech();
    }
    this._reset();
  }
}

/**
 * Decode Twilio μ-law (PCMU) byte to 16-bit PCM LE.
 * @param {Buffer} mulawBuffer — raw μ-law encoded bytes
 * @returns {Buffer} — PCM 16-bit LE buffer
 */
function decodeMulaw(mulawBuffer) {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x1FFF;

  // μ-law decode table (ITU-T G.711)
  const pcm = Buffer.alloc(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    let mulaw = ~mulawBuffer[i] & 0xFF;
    const sign = (mulaw & 0x80) ? -1 : 1;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;
    let sample = (mantissa << (exponent + 3)) + MULAW_BIAS * ((1 << (exponent + 3)) - 1);
    sample = Math.min(sample, MULAW_MAX);
    sample *= sign;
    pcm.writeInt16LE(sample, i * 2);
  }
  return pcm;
}

module.exports = { VoiceActivityDetector, decodeMulaw };
