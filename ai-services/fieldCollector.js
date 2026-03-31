/**
 * Per-field data collection with retry loops and confidence thresholds.
 * Each field (name, address, issue) has its own collection cycle:
 *   TTS prompt → listen → STT → confidence check → retry or accept
 *
 * After 3 failed attempts, triggers human agent handoff.
 */

const { getLanguageFromDTMF } = require('./languageRouter');

const CONFIDENCE_THRESHOLD = 0.75;
const MAX_RETRIES = 3;

/**
 * Field definitions with TTS prompts in multiple languages.
 */
const FIELD_DEFINITIONS = {
  name: {
    key: 'name',
    prompts: {
      'en': 'Please say your full name clearly after the beep.',
      'ta': 'உங்கள் முழு பெயரை தெளிவாக சொல்லுங்கள்.',
      'hi': 'कृपया अपना पूरा नाम स्पष्ट रूप से बोलें।',
      'te': 'దయచేసి మీ పూర్తి పేరు స్పష్టంగా చెప్పండి.',
      'kn': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಹೇಳಿ.',
      'ml': 'ദയവായി നിങ്ങളുടെ മുഴുവൻ പേര് വ്യക്തമായി പറയുക.',
      'bn': 'অনুগ্রহ করে আপনার পুরো নাম স্পষ্টভাবে বলুন।',
      'mr': 'कृपया आपले पूर्ण नाव स्पष्टपणे सांगा.',
      'gu': 'કૃપા કરીને તમારું પૂરું નામ સ્પષ્ટ રીતે બોલો.',
      'pa': 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਸਪਸ਼ਟ ਰੂਪ ਵਿੱਚ ਬੋਲੋ।'
    },
    retryPrompts: {
      'en': 'Sorry, I could not understand your name clearly. Please say it again slowly.',
      'ta': 'மன்னிக்கவும், உங்கள் பெயர் புரியவில்லை. மீண்டும் மெதுவாக சொல்லுங்கள்.',
      'hi': 'क्षमा करें, मैं आपका नाम स्पष्ट रूप से नहीं समझ सका। कृपया धीरे-धीरे फिर से बोलें।'
    },
    maxDurationSec: 10
  },

  address: {
    key: 'address',
    prompts: {
      'en': 'Please say your complete address including village or ward name, district, and pin code.',
      'ta': 'உங்கள் முழு முகவரியை சொல்லுங்கள் - கிராமம் அல்லது வார்டு, மாவட்டம், மற்றும் பின் கோட் உட்பட.',
      'hi': 'कृपया अपना पूरा पता बताएं - गाँव या वार्ड, जिला, और पिन कोड सहित।',
      'te': 'దయచేసి మీ పూర్తి చిరునామా చెప్పండి - గ్రామం లేదా వార్డు, జిల్లా, మరియు పిన్ కోడ్ తో సహా.',
      'kn': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ವಿಳಾಸವನ್ನು ಹೇಳಿ - ಗ್ರಾಮ ಅಥವಾ ವಾರ್ಡ್, ಜಿಲ್ಲೆ, ಮತ್ತು ಪಿನ್ ಕೋಡ್ ಸೇರಿದಂತೆ.',
      'ml': 'ദയവായി നിങ്ങളുടെ പൂർണ്ണ വിലാസം പറയുക - ഗ്രാമം അല്ലെങ്കിൽ വാർഡ്, ജില്ല, പിൻ കോഡ് ഉൾപ്പെടെ.',
      'bn': 'অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা বলুন - গ্রাম বা ওয়ার্ড, জেলা এবং পিন কোড সহ।',
      'mr': 'कृपया तुमचा पूर्ण पत्ता सांगा - गाव किंवा वॉर्ड, जिल्हा आणि पिन कोड यासह.',
      'gu': 'કૃપા કરીને તમારું પૂરું સરનામું બોલો - ગામ અથવા વોર્ડ, જિલ્લો, અને પિન કોડ સહિત.',
      'pa': 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਪਤਾ ਦੱਸੋ - ਪਿੰਡ ਜਾਂ ਵਾਰਡ, ਜ਼ਿਲ੍ਹਾ, ਅਤੇ ਪਿੰਨ ਕੋਡ ਸਮੇਤ।'
    },
    retryPrompts: {
      'en': 'Sorry, I could not understand your address. Please say your village, district, and pin code again slowly.',
      'ta': 'மன்னிக்கவும், உங்கள் முகவரி புரியவில்லை. ஊர், மாவட்டம், பின் கோட் மீண்டும் சொல்லுங்கள்.',
      'hi': 'क्षमा करें, मैं आपका पता नहीं समझ सका। कृपया अपना गाँव, जिला, और पिन कोड फिर से बोलें।'
    },
    maxDurationSec: 20
  },

  issue: {
    key: 'issue',
    prompts: {
      'en': 'Please describe your complaint or issue in detail. Speak clearly for about 30 seconds.',
      'ta': 'உங்கள் புகார் அல்லது பிரச்சனையை விரிவாக சொல்லுங்கள். சுமார் 30 வினாடிகள் தெளிவாக பேசுங்கள்.',
      'hi': 'कृपया अपनी शिकायत या समस्या का विस्तार से वर्णन करें। लगभग 30 सेकंड तक स्पष्ट रूप से बोलें।',
      'te': 'దయచేసి మీ ఫిర్యాదు లేదా సమస్యను వివరంగా చెప్పండి. దాదాపు 30 సెకన్లు స్పష్టంగా మాట్లాడండి.',
      'kn': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ದೂರು ಅಥವಾ ಸಮಸ್ಯೆಯನ್ನು ವಿವರವಾಗಿ ಹೇಳಿ. ಸುಮಾರು 30 ಸೆಕೆಂಡುಗಳ ಕಾಲ ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ.',
      'ml': 'ദയവായി നിങ്ങളുടെ പരാതി അല്ലെങ്കിൽ പ്രശ്നം വിശദമായി വിവരിക്കുക. ഏകദേശം 30 സെക്കൻഡ് വ്യക്തമായി സംസാരിക്കുക.',
      'bn': 'অনুগ্রহ করে আপনার অভিযোগ বা সমস্যা বিস্তারিতভাবে বলুন। প্রায় 30 সেকেন্ড স্পষ্টভাবে কথা বলুন।',
      'mr': 'कृपया तुमची तक्रार किंवा समस्या तपशीलवार सांगा. सुमारे 30 सेकंद स्पष्टपणे बोला.',
      'gu': 'કૃપા કરીને તમારી ફરિયાદ અથવા સમસ્યાનું વિગતવાર વર્ણન કરો. લગભગ 30 સેકન્ડ સ્પષ્ટ રીતે બોલો.',
      'pa': 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਸ਼ਿਕਾਇਤ ਜਾਂ ਸਮੱਸਿਆ ਦਾ ਵਿਸਤਾਰ ਨਾਲ ਵਰਣਨ ਕਰੋ। ਲਗਭਗ 30 ਸਕਿੰਟ ਸਪਸ਼ਟ ਰੂਪ ਵਿੱਚ ਬੋਲੋ।'
    },
    retryPrompts: {
      'en': 'Sorry, I could not understand your complaint clearly. Please describe your issue again slowly and clearly.',
      'ta': 'மன்னிக்கவும், உங்கள் புகார் புரியவில்லை. மீண்டும் மெதுவாகவும் தெளிவாகவும் சொல்லுங்கள்.',
      'hi': 'क्षमा करें, मैं आपकी शिकायत को स्पष्ट रूप से नहीं समझ सका। कृपया अपनी समस्या फिर से धीरे और स्पष्ट रूप से बताएं।'
    },
    maxDurationSec: 30
  }
};

/**
 * Get the TTS prompt for a field in the appropriate language.
 * @param {string} fieldKey — 'name', 'address', or 'issue'
 * @param {string} whisperCode — language code (e.g., 'ta', 'hi', 'en')
 * @param {boolean} isRetry — whether this is a retry attempt
 * @returns {string}
 */
function getFieldPrompt(fieldKey, whisperCode, isRetry = false) {
  const field = FIELD_DEFINITIONS[fieldKey];
  if (!field) return 'Please speak now.';

  if (isRetry) {
    return field.retryPrompts[whisperCode] || field.retryPrompts['en'] || 'Please try again.';
  }
  return field.prompts[whisperCode] || field.prompts['en'] || 'Please speak now.';
}

/**
 * Collect a single field via the streaming STT session.
 * Implements retry loop with confidence checking.
 *
 * @param {object} sttSession — streaming STT session from streamingSTT.js
 * @param {string} fieldKey — 'name', 'address', or 'issue'
 * @param {string} whisperCode — language code
 * @param {object} options — { sendTTS: Function, confidenceThreshold, maxRetries }
 * @returns {Promise<{ value: string, confidence: number, attempts: number, handoff: boolean }>}
 */
async function collectField(sttSession, fieldKey, whisperCode, options = {}) {
  const {
    sendTTS = async () => {},
    confidenceThreshold = CONFIDENCE_THRESHOLD,
    maxRetries = MAX_RETRIES
  } = options;

  const field = FIELD_DEFINITIONS[fieldKey];
  if (!field) {
    throw new Error(`Unknown field: ${fieldKey}`);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 1;
    const prompt = getFieldPrompt(fieldKey, whisperCode, isRetry);

    // Send TTS prompt to caller
    await sendTTS(prompt, whisperCode);

    // Wait for transcription
    const result = await sttSession.waitForNextTranscript(
      (field.maxDurationSec + 5) * 1000
    );

    if (!result || !result.text || result.text.trim().length === 0) {
      console.log(`[FieldCollector] ${fieldKey} attempt ${attempt}/${maxRetries}: no speech detected`);
      continue;
    }

    console.log(`[FieldCollector] ${fieldKey} attempt ${attempt}/${maxRetries}: "${result.text}" (confidence: ${result.confidence})`);

    // Check confidence threshold
    if (result.confidence >= confidenceThreshold) {
      return {
        value: result.text.trim(),
        confidence: result.confidence,
        attempts: attempt,
        handoff: false
      };
    }

    // Confidence too low but we got something — log and retry
    console.log(`[FieldCollector] ${fieldKey}: confidence ${result.confidence} below threshold ${confidenceThreshold}`);
  }

  // All retries exhausted → hand off to human agent
  console.log(`[FieldCollector] ${fieldKey}: all ${maxRetries} retries exhausted — requesting human handoff`);
  return {
    value: null,
    confidence: 0,
    attempts: maxRetries,
    handoff: true
  };
}

/**
 * Collect all required fields sequentially.
 * @param {object} sttSession — streaming STT session
 * @param {string} whisperCode — language code
 * @param {object} options — { sendTTS, confidenceThreshold, maxRetries }
 * @returns {Promise<{ fields: object, handoffRequired: boolean, handoffField: string|null }>}
 */
async function collectAllFields(sttSession, whisperCode, options = {}) {
  const fieldOrder = ['name', 'address', 'issue'];
  const collected = {};

  for (const fieldKey of fieldOrder) {
    const result = await collectField(sttSession, fieldKey, whisperCode, options);

    if (result.handoff) {
      return {
        fields: collected,
        handoffRequired: true,
        handoffField: fieldKey
      };
    }

    collected[fieldKey] = {
      value: result.value,
      confidence: result.confidence,
      attempts: result.attempts
    };
  }

  return {
    fields: collected,
    handoffRequired: false,
    handoffField: null
  };
}

/**
 * Build TwiML for human agent handoff.
 * @param {string} whisperCode — language code for the farewell message
 * @param {string} fieldKey — which field triggered the handoff
 * @returns {string} — TwiML XML
 */
function buildHandoffTwiML(whisperCode, fieldKey) {
  const messages = {
    'en': `I'm having difficulty understanding your ${fieldKey}. Let me connect you to a human agent who can help. Please hold.`,
    'ta': `உங்கள் ${fieldKey === 'name' ? 'பெயர்' : fieldKey === 'address' ? 'முகவரி' : 'புகார்'} புரிந்துகொள்ள சிரமம் ஏற்படுகிறது. ஒரு உதவியாளரிடம் இணைக்கிறேன். தயவுசெய்து காத்திருங்கள்.`,
    'hi': `मुझे आपकी ${fieldKey === 'name' ? 'नाम' : fieldKey === 'address' ? 'पता' : 'शिकायत'} समझने में कठिनाई हो रही है। मैं आपको एक सहायक से जोड़ रहा हूं। कृपया प्रतीक्षा करें।`
  };

  const msg = messages[whisperCode] || messages['en'];
  const agentQueue = process.env.HUMAN_AGENT_QUEUE || '+919999999999';

  return `
    <Response>
      <Say voice="Polly.Aditi" language="${whisperCode === 'ta' ? 'ta-IN' : whisperCode === 'hi' ? 'hi-IN' : 'en-IN'}">${msg}</Say>
      <Dial timeout="30" action="/api/twilio/handoff-status">
        <Queue>complaint-support</Queue>
      </Dial>
      <Say voice="Polly.Aditi">We are sorry, no agents are available right now. Please call back later. Goodbye.</Say>
    </Response>
  `;
}

module.exports = {
  FIELD_DEFINITIONS,
  CONFIDENCE_THRESHOLD,
  MAX_RETRIES,
  getFieldPrompt,
  collectField,
  collectAllFields,
  buildHandoffTwiML
};
