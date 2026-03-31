import React, { useState, useRef, useEffect } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { translations } from '../utils/translations';

export default function AICallButton({ onComplete, lang = 'en' }) {
  const t = translations[lang] || translations.en;

  const [isCallActive, setIsCallActive] = useState(false);
  const [currentStep, setCurrentStep] = useState('idle');
  const [statusText, setStatusText] = useState(t.systemReady);
  const [aiText, setAiText] = useState(t.pressCall);
  const [userText, setUserText] = useState('');
  const [isVisualizerActive, setIsVisualizerActive] = useState(false);
  const [showLangButtons, setShowLangButtons] = useState(false);
  
  const stateRef = useRef({ lang: 'en-IN', name: '', address: '', issue: '' });
  const mediaRecorderRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const langResolverRef = useRef(null); // Shared resolver for language selection
  const recognitionRef = useRef(null);

  const langOptions = [
    { code: 'en-IN', label: 'English', emoji: '🇬🇧' },
    { code: 'ta-IN', label: 'தமிழ்', emoji: '🇮🇳' },
    { code: 'hi-IN', label: 'हिंदी', emoji: '🇮🇳' },
    { code: 'te-IN', label: 'తెలుగు', emoji: '🇮🇳' },
    { code: 'ml-IN', label: 'മലയാളം', emoji: '🇮🇳' },
    { code: 'mr-IN', label: 'मराठी', emoji: '🇮🇳' },
  ];

  const handleLangButtonClick = (langCode) => {
    if (langResolverRef.current) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      langResolverRef.current(langCode);
      langResolverRef.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showLangButtons) return;
      if (e.key >= '1' && e.key <= '6') {
        const index = parseInt(e.key) - 1;
        if (langOptions[index]) {
          handleLangButtonClick(langOptions[index].code);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLangButtons]);

  useEffect(() => {
    if (currentStep === 'idle') {
      setStatusText(t.systemReady);
      setAiText(t.pressCall);
    }
  }, [lang, currentStep, t]);

  // Multilingual System Prompts
  const prompts = {
    'en-IN': {
      langSelected: "English selected.",
      askName: "Please say your full name clearly after the beep.",
      askAddress: "Please say your complete address including village or ward, district, and pin code.",
      askIssue: "Please describe your complaint or issue in detail after the beep.",
    },
    'ta-IN': {
      langSelected: "தமிழ் தேர்ந்தெடுக்கப்பட்டது.",
      askName: "உங்கள் முழுப் பெயரைக் கூறுங்கள்.",
      askAddress: "உங்கள் முழுமையான முகவரியைக் கூறுங்கள்.",
      askIssue: "உங்கள் புகார் அல்லது பிரச்சனையை விரிவாக விவரிக்கவும்.",
    },
    'hi-IN': {
      langSelected: "हिंदी चुनी गई।",
      askName: "कृपया अपना पूरा नाम बताएं।",
      askAddress: "कृपया अपना पूरा पता बताएं।",
      askIssue: "कृपया अपनी शिकायत का विस्तार से वर्णन करें।",
    },
    'te-IN': {
      langSelected: "తెలుగు ఎంపిక చేయబడింది.",
      askName: "దయచేసి మీ పూర్తి పేరు చెప్పండి.",
      askAddress: "దయచేసి మీ పూర్తి చిరునామాను చెప్పండి.",
      askIssue: "దయచేసి మీ ఫిర్యాదును వివరంగా చెప్పండి.",
    },
    'ml-IN': {
      langSelected: "മലയാളം തിരഞ്ഞെടുത്തു.",
      askName: "ദയവായി നിങ്ങളുടെ മുഴുവൻ പേര് പറയുക.",
      askAddress: "ദയവായി നിങ്ങളുടെ പൂർണ്ണ വിലാസം പറയുക.",
      askIssue: "ദയവായി നിങ്ങളുടെ പരാതി വിശദമാക്കുക.",
    },
    'mr-IN': {
      langSelected: "मराठी निवडली आहे.",
      askName: "कृपया तुमचे पूर्ण नाव सांगा.",
      askAddress: "कृपया तुमचा संपूर्ण पत्ता सांगा.",
      askIssue: "कृपया तुमची तक्रार सविस्तर सांगा.",
    }
  };

  useEffect(() => {
    return () => {
      if (synthRef.current.speaking) synthRef.current.cancel();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
    };
  }, []);

  const speakAI = (text, lang = 'en-IN') => {
    return new Promise((resolve) => {
      setStatusText("AI speaking...");
      setAiText(text);
      setUserText("");
      setIsVisualizerActive(false);
      
      if (synthRef.current.speaking) { synthRef.current.cancel(); }
      
      const langPrefix = lang.split('-')[0]; // 'ta' from 'ta-IN'
      
      // Check if a native voice exists for this language
      const voices = synthRef.current.getVoices();
      const hasNativeVoice = voices.some(v => v.lang === lang || v.lang.startsWith(langPrefix));
      
      if (hasNativeVoice) {
        // Use browser's native speechSynthesis
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        let voice = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(langPrefix));
        if (voice) utterance.voice = voice;
        utterance.rate = 1.15;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        synthRef.current.speak(utterance);
      } else {
        // Fallback: Route through our backend TTS proxy (avoids CORS)
        const encodedText = encodeURIComponent(text);
        const ttsUrl = `http://localhost:5000/api/twilio/tts-proxy?text=${encodedText}&lang=${langPrefix}`;
        const audio = new Audio(ttsUrl);
        audio.playbackRate = 1.15;
        audio.onended = () => resolve();
        audio.onerror = () => {
          // If Google TTS also fails, just show the text and move on
          console.warn(`TTS failed for lang ${lang}, showing text only`);
          setTimeout(resolve, 2000); // Give user 2s to read the text
        };
        audio.play().catch(() => {
          console.warn('Audio play blocked, falling back to text display');
          setTimeout(resolve, 2000);
        });
      }
    });
  };

  const playBeep = () => {
    return new Promise(resolve => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(resolve, 600);
    });
  };

  const startRecording = async (lang = 'en-US', isContinuous = false) => {
    setStatusText("Listening... Speak now");
    setIsVisualizerActive(true);
    
    return new Promise((resolve) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsVisualizerActive(false);
        resolve("Browser does not support SpeechRecognition.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = lang;
      recognition.continuous = isContinuous;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalTranscript = "";
      let hasEnded = false;
      let speechEndTimer = null;

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        // Live feedback — show what's being captured
        setUserText(`You: ${finalTranscript}${interim}`);
      };

      recognition.onspeechend = () => {
        // Give 2 seconds after speech ends for final processing
        if (isContinuous) {
          speechEndTimer = setTimeout(() => {
            try { recognition.stop(); } catch(e) {}
          }, 2000);
        }
      };

      recognition.onspeechstart = () => {
        if (speechEndTimer) { clearTimeout(speechEndTimer); speechEndTimer = null; }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech' && !finalTranscript) {
          finalTranscript = "I couldn't hear you.";
        }
      };

      recognition.onend = () => {
        if (hasEnded) return;
        hasEnded = true;
        if (speechEndTimer) { clearTimeout(speechEndTimer); speechEndTimer = null; }
        setIsVisualizerActive(false);
        setStatusText("Processing...");
        const resultText = finalTranscript.trim() || "No input detected";
        resolve(resultText);
      };

      try {
        recognition.start();
        // Allow up to 30s for continuous, 15s for short
        setTimeout(() => {
          if (!hasEnded) {
            try { recognition.stop(); } catch (e) {}
          }
        }, isContinuous ? 30000 : 15000);
      } catch (e) {
        setIsVisualizerActive(false);
        resolve("Could not start microphone.");
      }
    });
  };

  const getValidInput = async (promptText, lang, maxRetries = 3, isContinuous = false) => {
    let attempts = 0;
    while (attempts < maxRetries && isCallActiveRef.current) {
      await speakAI(promptText, lang);
      await playBeep();
      const text = await startRecording(lang, isContinuous);
      if (text && text !== "No input detected" && text !== "Browser does not support SpeechRecognition." && text !== "I couldn't hear you.") {
        return text;
      }
      attempts++;
      if (attempts < maxRetries) {
        setStatusText("No input detected, asking again...");
        const retryMsg = lang === 'ta-IN' ? "மன்னிக்கவும், எதுவும் கேட்கவில்லை. மீண்டும் கூறவும்." : 
                        (lang === 'hi-IN' ? "क्षमा करें, मुझे कुछ सुनाई नहीं दिया। कृपया फिर से बोलें।" : 
                        (lang === 'te-IN' ? "క్షమించండి, నాకు ఏమీ వినిపించలేదు. దయచేసి మళ్లీ చెప్పండి." :
                        (lang === 'ml-IN' ? "ക്ഷമിക്കണം, എനിക്കൊന്നും കേൾക്കാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും പറയുക." :
                        (lang === 'mr-IN' ? "क्षमस्व, मला काहीही ऐकू आले नाही. कृपया पुन्हा सांगा." : "I didn't catch that. Please speak again."))));
        await speakAI(retryMsg, lang);
      }
    }
    
    // Smart Fallback
    if (promptText.toLowerCase().includes("name") || promptText.includes("பெயர்") || promptText.includes("नाम")) return "Unrecognized Citizen";
    if (promptText.toLowerCase().includes("address") || promptText.includes("முகவரி") || promptText.includes("पता")) return "Unrecognized Location";
    return "This is a fallback complaint because the browser microphone failed to capture my voice properly.";
  };

  const startCall = async () => {
    setIsCallActive(true);
    setCurrentStep('lang');

    // Step 1: Language Selection via BUTTONS + optional voice
    setShowLangButtons(true);
    setAiText('Select your language / अपनी भाषा चुनें');
    setStatusText('Tap a language button or say a number (1-6)');
    await speakAI("Welcome to MAKKAL VOICE. Please select your language by tapping a button, or say a number from 1 to 6.", 'en-IN');

    // Race: button click vs voice input
    const selectedLang = await new Promise((resolve) => {
      langResolverRef.current = resolve;
      
      // Also try voice recognition in parallel
      startRecording('en-US').then((transcript) => {
        if (langResolverRef.current) { // Only if button hasn't been clicked yet
          const lower = transcript.toLowerCase();
          let detected = null;
          if (/\b(one|1|en|eng|english|won)\b/.test(lower)) detected = 'en-IN';
          else if (/\b(two|2|ta|tamil|too|to)\b/.test(lower)) detected = 'ta-IN';
          else if (/\b(three|3|hi|hindi|free|tree)\b/.test(lower)) detected = 'hi-IN';
          else if (/\b(four|4|te|telugu|for)\b/.test(lower)) detected = 'te-IN';
          else if (/\b(five|5|ml|malayalam|fi|ma)\b/.test(lower)) detected = 'ml-IN';
          else if (/\b(six|6|mr|marathi|si|mar)\b/.test(lower)) detected = 'mr-IN';
          
          if (detected && langResolverRef.current) {
            langResolverRef.current(detected);
            langResolverRef.current = null;
          } else if (langResolverRef.current) {
            // Voice failed, just wait for button click — don't auto-default
            setStatusText('Please tap your language button above');
            setAiText('Tap your language to continue');
          }
        }
      });
    });
    
    setShowLangButtons(false);
    stateRef.current.lang = selectedLang;
    const p = prompts[selectedLang];

    if (!isCallActiveRef.current) return;

    // Step 2: Name (Strict Loop)
    setCurrentStep('name');
    await speakAI(p.langSelected, selectedLang);
    const nameText = await getValidInput(p.askName, selectedLang, 5);
    if (!nameText) { endCall(); return; }
    setUserText(`You: "${nameText}"`);
    stateRef.current.name = nameText;

    if (!isCallActiveRef.current) return;

    // Step 3: Address (Strict Loop)
    setCurrentStep('address');
    const addressText = await getValidInput(p.askAddress, selectedLang, 5, true);
    if (!addressText) { endCall(); return; }
    setUserText(`You: "${addressText}"`);
    stateRef.current.address = addressText;

    if (!isCallActiveRef.current) return;

    // Step 4: Issue (Strict Loop)
    setCurrentStep('issue');
    const issueText = await getValidInput(p.askIssue, selectedLang, 5, true);
    if (!issueText) { endCall(); return; }
    setUserText(`You: "${issueText}"`);
    stateRef.current.issue = issueText;

    if (!isCallActiveRef.current) return;

    // Step 5: Submission
    setCurrentStep('processing');
    const waitMsgs = {
      'en-IN': "Please wait while our AI analyzes your complaint.",
      'ta-IN': "உங்கள் புகாரை சரிபார்க்கும் வரை காத்திருக்கவும்.",
      'hi-IN': "कृपया प्रतीक्षा करें, हम आपकी शिकायत दर्ज कर रहे हैं।",
      'te-IN': "దయచేసి వేచి ఉండండి, మీ ఫిర్యాదును విశ్లేషిస్తున్నాము.",
      'ml-IN': "ദയവായി കാത്തിരിക്കുക, നിങ്ങളുടെ പരാതി വിശകലനം ചെയ്യുന്നു.",
      'mr-IN': "कृपया प्रतीक्षा करा, तुमची तक्रार विश्लेषित केली जात आहे.",
    };
    await speakAI(waitMsgs[selectedLang] || waitMsgs['en-IN'], selectedLang);
    setStatusText("Thinking & routing to department...");
    
    try {
      const response = await fetch('http://localhost:5000/api/twilio/web-submit-complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateRef.current)
      });
      const data = await response.json();
      
      if (data.trackingId) {
        const successMsgs = {
          'en-IN': `Thank you. Your tracking ID is ${data.trackingId}. The department has been notified.`,
          'ta-IN': `நன்றி. உங்கள் புகார் எண் ${data.trackingId}. துறைக்கு தெரிவிக்கப்பட்டுள்ளது.`,
          'hi-IN': `धन्यवाद। आपकी शिकायत आईडी ${data.trackingId} है। विभाग को सूचित कर दिया गया है।`,
          'te-IN': `ధన్యవాదాలు. మీ ట్రాకింగ్ ఐడి ${data.trackingId}. విభాగానికి తెలియజేయబడింది.`,
          'ml-IN': `നന്ദി. നിങ്ങളുടെ ട്രാക്കിംഗ് ഐഡി ${data.trackingId}. വകുപ്പിനെ അറിയിച്ചിട്ടുണ്ട്.`,
          'mr-IN': `धन्यवाद. तुमचा ट्रॅकिंग आयडी ${data.trackingId} आहे. विभागाला कळवले आहे.`,
        };
        await speakAI(successMsgs[selectedLang] || successMsgs['en-IN'], selectedLang);
        if (onComplete) onComplete(data);
      } else {
        const failMsgs = {
          'en-IN': "Verification failed. We could not process your complaint right now.",
          'ta-IN': "புகாரை பதிவு செய்ய முடியவில்லை.",
          'hi-IN': "सत्यापन विफल। अभी आपकी शिकायत संसाधित नहीं हो सकी।",
          'te-IN': "ధృవీకరణ విఫలమైంది. ప్రస్తుతం మీ ఫిర్యాదును ప్రాసెస్ చేయలేకపోయాము.",
          'ml-IN': "സ്ഥിരീകരണം പരാജയപ്പെട്ടു. നിങ്ങളുടെ പരാതി ഇപ്പോൾ പ്രോസസ്സ് ചെയ്യാൻ കഴിഞ്ഞില്ല.",
          'mr-IN': "पडताळणी अयशस्वी. सध्या तुमची तक्रार प्रक्रिया करता आली नाही.",
        };
        await speakAI(failMsgs[selectedLang] || failMsgs['en-IN'], selectedLang);
      }
    } catch (err) {
      await speakAI("Sorry, there was an error submitting the complaint.");
    }

    endCall();
  };

  const isCallActiveRef = useRef(false);
  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  const endCall = () => {
    setIsCallActive(false);
    setCurrentStep('idle');
    if (synthRef.current.speaking) synthRef.current.cancel();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    setIsVisualizerActive(false);
    setStatusText(t.callEnded);
  };

  const toggleCall = async () => {
    if (!isCallActive) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        startCall();
      } catch (err) {
        alert('Microphone access is required for the web call.');
      }
    } else {
      endCall();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem' }}>
      
      {/* Call Button */}
      <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '2rem' }}>
        {isCallActive && (
          <>
            <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--danger)', opacity: 0.2, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
            <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--danger)', opacity: 0.2, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite', animationDelay: '0.5s' }}></div>
          </>
        )}
        <button 
          onClick={toggleCall}
          style={{
            width: '80px', height: '80px', borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: isCallActive ? 'var(--danger)' : 'var(--primary)',
            color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center',
            boxShadow: isCallActive ? '0 0 20px rgba(239,68,68,0.5)' : '0 0 20px rgba(79,70,229,0.3)',
            zIndex: 10, transition: 'all 0.3s ease'
          }}
        >
          {isCallActive ? <PhoneOff size={32} /> : <Phone size={32} />}
        </button>
      </div>

      {/* Language Selection Buttons */}
      {showLangButtons && (
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', 
          width: '100%', marginBottom: '1.5rem', animation: 'fadeIn 0.3s ease'
        }}>
          {langOptions.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLangButtonClick(lang.code)}
              style={{
                padding: '0.75rem 0.5rem', borderRadius: '0.75rem', cursor: 'pointer',
                border: '2px solid var(--primary)', background: 'rgba(79,70,229,0.05)',
                color: 'var(--text-main)', fontWeight: '600', fontSize: '0.95rem',
                transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '0.25rem'
              }}
              onMouseOver={(e) => { e.target.style.background = 'var(--primary)'; e.target.style.color = 'white'; }}
              onMouseOut={(e) => { e.target.style.background = 'rgba(79,70,229,0.05)'; e.target.style.color = 'var(--text-main)'; }}
            >
              <span style={{ fontSize: '1.2rem' }}>{lang.emoji}</span>
              <span>{lang.label}</span>
            </button>
          ))}
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Transcript UI */}
      <div style={{
        width: '100%', background: 'var(--bg)', padding: '1.5rem', borderRadius: '0.75rem', 
        border: '1px solid var(--border)', minHeight: '130px', transition: 'all 0.3s ease',
        opacity: isCallActive ? 1 : 0.5
      }}>
        <div style={{ color: 'var(--primary)', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isCallActive ? 'var(--success)' : 'var(--text-muted)' }}></div>
          {t.simulationTitle}
        </div>
        <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '1rem' }}>{aiText}</p>
        
        {userText && (
          <div style={{ background: 'rgba(79,70,229,0.05)', padding: '0.75rem', borderRadius: '0.5rem', borderLeft: '3px solid var(--primary)' }}>
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.95rem' }}>{userText}</p>
          </div>
        )}

        {isVisualizerActive && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', gap: '4px', height: '24px', alignItems: 'flex-end' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                width: '4px', background: 'var(--primary)', borderRadius: '2px',
                animation: `sound 400ms ${-i*200}ms linear infinite alternate`
              }}></div>
            ))}
            <style>{`@keyframes sound { 0% { height: 4px; opacity: 0.5; } 100% { height: 24px; opacity: 1; } }`}</style>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        {statusText}
      </div>
    </div>
  );
}
