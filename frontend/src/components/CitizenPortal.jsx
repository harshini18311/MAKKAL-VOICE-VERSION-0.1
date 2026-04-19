import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Mic, Square, Send, CheckCircle, MapPin, Navigation, Camera, X, Phone, Brain, Sparkles } from 'lucide-react';
import { translations } from '../utils/translations';
import { reverseGeocode, isWithinTamilNaduBounds } from '../utils/geoUtils';
import MapPicker from './MapPicker';
import AICallButton from './AICallButton';

const loaderMessages = [
  "AI is analyzing your complaint...",
  "Scanning image for visual evidence...",
  "Translating dialect into official records...",
  "Identifying civic department...",
  "Calculating priority & urgency...",
  "Verifying semantic alignment...",
  "Finalizing your secure submission..."
];

export default function CitizenPortal({ lang }) {
  const [activeTab, setActiveTab] = useState('aicall'); // aicall, voice, or text
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', location: '', complaintText: '', image: '' });
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [gpsCapturedAt, setGpsCapturedAt] = useState(null); // epoch ms — freshness for server
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState(null);
  const [loaderIndex, setLoaderIndex] = useState(0);

  React.useEffect(() => {
    let interval;
    if (isSubmitting) {
      interval = setInterval(() => {
        setLoaderIndex((prev) => (prev + 1) % loaderMessages.length);
      }, 2000);
    } else {
      setLoaderIndex(0);
    }
    return () => clearInterval(interval);
  }, [isSubmitting]);
  
  const t = translations[lang] || translations.en;
  
  // Real-time voice transcript
  const [voiceText, setVoiceText] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported. Please use Google Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    
    // Map selected language to Speech API format
    const langMap = { en: 'en-US', ta: 'ta-IN', hi: 'hi-IN', te: 'te-IN', mr: 'mr-IN', ml: 'ml-IN' };
    recognition.lang = langMap[lang] || 'en-US';
    
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      setVoiceText('');
      setAudioBlob(null); // Reset flag
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setVoiceText(transcript);
      setAudioBlob(true); // Fake audioBlob flag to enable Submit button
    };

    recognition.onerror = (event) => {
      console.error('Microphone Error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const stopRecording = () => {
    setIsRecording(false);
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
      // Wait for ref to be available
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Could not access camera. Please ensure you've given permission.");
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setFormData({ ...formData, image: dataUrl });
    closeCamera();
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Image size should be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`Detected location with accuracy: ${accuracy} meters`);
          if (!isWithinTamilNaduBounds(latitude, longitude)) {
            alert(
              'Your GPS position is outside Tamil Nadu. This service is for Tamil Nadu only — use “Pin on map” to choose a location inside the state.'
            );
            setIsDetecting(false);
            return;
          }
          setCoords({ lat: latitude, lng: longitude });
          setGpsCapturedAt(typeof position.timestamp === 'number' ? position.timestamp : Date.now());
          const address = await reverseGeocode(latitude, longitude);
          setFormData(prev => ({ ...prev, location: address }));
        } catch (err) {
          console.error("Geocoding error", err);
          alert("Location detected but could not find the address. Please pin it manually.");
        } finally {
          setIsDetecting(false);
        }
      },
      (error) => {
        let msg = "Unable to retrieve location: ";
        if (error.code === 1) msg += "Permission denied. Please enable location access.";
        else if (error.code === 2) msg += "Position unavailable. Ensure GPS is on.";
        else if (error.code === 3) msg += "Timeout. Please try again or use the map.";
        else msg += error.message;
        
        alert(msg);
        setIsDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const getDeviceFingerprint = () => {
    try {
      let fp = localStorage.getItem('civic_device_fp');
      if (!fp) {
        fp = `fp_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
        localStorage.setItem('civic_device_fp', fp);
      }
      return fp;
    } catch {
      return `fp_${Date.now()}`;
    }
  };

  const submitComplaint = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('You must be logged in to submit a complaint.');
      return;
    }

    if (activeTab === 'aicall') return;
    if (!formData.name || !formData.location || !formData.image || (activeTab === 'voice' && !voiceText) || (activeTab === 'text' && !formData.complaintText)) {
      alert(t.validationError + " (Please ensure Name, Location, and Image are provided)");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const url = `http://localhost:5000/api/complaint`;
      let payload;
      let headers = { Authorization: `Bearer ${token}` };

      const geoPayload =
        coords && gpsCapturedAt != null
          ? { lat: coords.lat, lng: coords.lng, gpsCapturedAt }
          : coords
            ? { lat: coords.lat, lng: coords.lng, gpsCapturedAt: Date.now() }
            : {};

      const common = {
        ...geoPayload,
        image: formData.image,
        fingerprint: getDeviceFingerprint()
      };

      if (activeTab === 'voice') {
        if (!voiceText) {
          alert('No speech was detected. Please try speaking louder.');
          setIsSubmitting(false);
          return;
        }
        payload = { text: voiceText, name: formData.name, location: formData.location, ...common };
        headers['Content-Type'] = 'application/json';
      } else {
        payload = { ...formData, text: formData.complaintText, ...common };
      }

      const { data } = await axios.post(url, payload, { headers });
      setResult(data);
    } catch (error) {
      const d = error.response?.data;
      if (d?.decision === 'FAKE') {
        setResult({ rejected: true, ...d });
      } else {
        alert(d?.error || 'Failed to submit complaint');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    if (result.rejected || result.decision === 'FAKE') {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
          <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#b91c1c' }}>Verification failed</h2>
            <p style={{ marginTop: '1rem' }}>{result.error || 'This submission did not pass automated verification.'}</p>
            {result.trackingId && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Reference: {result.trackingId}</p>}
            <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => { setResult(null); setAudioBlob(null); setFormData({name:'', location:'', complaintText:'', image: ''}); }}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    if (result.merged || result.duplicate) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
          <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
            <CheckCircle size={48} color="var(--secondary)" style={{ margin: '0 auto 1rem' }} />
            <h2>Linked to existing case</h2>
            <p style={{ marginTop: '1rem' }}>{result.message || 'Your report matches an open complaint.'}</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Original tracking ID:</strong> {result.linkedTrackingId}</p>
            <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => { setResult(null); setAudioBlob(null); setFormData({name:'', location:'', complaintText:'', image: ''}); }}>
              Done
            </button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
        <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
          <CheckCircle size={48} color="var(--secondary)" style={{ margin: '0 auto 1rem' }} />
          <h2>Complaint Registered!</h2>
          {result.emailSent && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: 'rgba(16, 185, 129, 0.1)', 
              color: '#059669', 
              borderRadius: '0.4rem',
              fontSize: '0.9rem',
              fontWeight: '500',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              ✅ {t.emailSentSuccess}
              {result.recipientEmail && <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.2rem' }}>To: {result.recipientEmail}</div>}
            </div>
          )}
          <div style={{ marginTop: '2rem', textAlign: 'left', background: 'rgba(0,0,0,0.05)', padding: '1rem', borderRadius: '0.5rem' }}>
            <p><strong>Tracking ID:</strong> {result.trackingId}</p>
            <p><strong>Category Detected:</strong> {result.category}</p>
            <p><strong>Priority Assigned:</strong> <span style={{ color: result.priority === 'High' ? 'red' : 'inherit' }}>{result.priority}</span></p>
            <hr style={{ margin: '1rem 0', borderColor: 'var(--border)' }} />
            <p><strong>AI Summary:</strong> {result.summary}</p>
            {result.emailDraft && (
              <>
                <hr style={{ margin: '1rem 0', borderColor: 'var(--border)' }} />
                <p><strong>Formal Email Draft:</strong></p>
                <pre style={{ 
                  whiteSpace: 'pre-wrap', 
                  fontSize: '0.8rem', 
                  background: 'rgba(255,255,255,0.5)', 
                  padding: '1rem', 
                  borderRadius: '0.4rem',
                  marginTop: '0.5rem',
                  fontFamily: 'inherit',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)'
                }}>
                  {result.emailDraft}
                </pre>
              </>
            )}

            {/* Fraud Detection Result */}
            {typeof result.fraudScore === 'number' && (
              <>
                <hr style={{ margin: '1rem 0', borderColor: 'var(--border)' }} />
                <p><strong>Complaint Authenticity Check:</strong></p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <span className={
                    result.fraudStatus === 'Flagged' ? 'fraud-badge fraud-flagged' :
                    result.fraudStatus === 'Suspicious' ? 'fraud-badge fraud-suspicious' :
                    'fraud-badge fraud-clean'
                  }>
                    {result.fraudStatus || 'Clean'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Score: {result.fraudScore}/100
                  </span>
                </div>
                <div className="fraud-bar-track" style={{ marginTop: '0.5rem' }}>
                  <div 
                    className="fraud-bar-fill"
                    style={{ 
                      width: `${result.fraudScore}%`,
                      background: result.fraudScore >= 61 ? 'var(--danger)' : result.fraudScore >= 31 ? '#f59e0b' : 'var(--secondary)'
                    }}
                  />
                </div>
                {(result.fraudReasons || []).length > 0 && (
                  <div style={{ marginTop: '0.75rem', background: 'rgba(0,0,0,0.03)', padding: '0.75rem', borderRadius: '0.4rem', fontSize: '0.8rem' }}>
                    <strong>Detection Signals:</strong>
                    <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                      {result.fraudReasons.map((r, i) => (
                        <li key={i} style={{ marginBottom: '0.2rem', color: r.startsWith('[AI]') ? '#7c3aed' : 'var(--text-main)' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Verified by AI + rule-based fraud detection system
                </p>
              </>
            )}
          </div>
          <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => { setResult(null); setAudioBlob(null); setFormData({name:'', location:'', complaintText:'', image: ''}); }}>
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
      <div className="glass-card" style={{ maxWidth: '500px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>{t.title}</h2>
        <p style={{ textAlign: 'center', marginBottom: '2rem' }}>{t.subtitle}</p>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
          <button 
            className={`btn ${activeTab === 'aicall' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
            onClick={() => setActiveTab('aicall')}
          >
            <Phone size={16} style={{ marginRight: '6px' }} /> {t.aiCall}
          </button>
          <button 
            className={`btn ${activeTab === 'voice' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
            onClick={() => setActiveTab('voice')}
          >
            <Mic size={16} style={{ marginRight: '6px' }} /> {t.voiceTab}
          </button>
          <button 
            className={`btn ${activeTab === 'text' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem' }} 
            onClick={() => setActiveTab('text')}
          >
            {t.textTab}
          </button>
        </div>

        {activeTab === 'aicall' ? (
          <AICallButton lang={lang} onComplete={(data) => setResult(data)} />
        ) : activeTab === 'voice' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0' }}>
            <button 
              className={`mic-btn ${isRecording ? 'recording' : 'idle'}`}
              onClick={startRecording}
            >
              {isRecording ? <Square size={32} /> : <Mic size={32} />}
            </button>
            <p style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              {isRecording ? t.listening : (voiceText ? t.recordingSaved : t.clickMic)}
            </p>
            {voiceText && (
              <div style={{ marginTop: '1.5rem', width: '100%', background: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(79, 70, 229, 0.2)' }}>
                <strong>Detected Speech:</strong>
                <p style={{ marginTop: '0.5rem', color: 'var(--text-main)', fontStyle: 'italic' }}>"{voiceText}"</p>
              </div>
            )}
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <input className="form-input" placeholder={t.namePlace} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input className="form-input" style={{ width: '100%' }} placeholder={t.locationPlace} value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }} onClick={handleDetectLocation} disabled={isDetecting}>
                      <Navigation size={14} className={isDetecting ? 'animate-pulse' : ''} /> {isDetecting ? 'Detecting...' : t.detectLocation}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }} onClick={() => setShowMap(true)}>
                      <MapPin size={14} /> {t.pinLocation}
                    </button>
                  </div>
                </div>
                
                <div style={{ width: '100px', height: '80px', flexShrink: 0 }}>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    width: '100%', 
                    height: '100%', 
                    border: '2px dashed var(--border)', 
                    borderRadius: '0.5rem', 
                    position: 'relative',
                    overflow: 'hidden',
                    background: formData.image ? 'none' : 'rgba(0,0,0,0.02)'
                  }}>
                    {formData.image ? (
                      <>
                        <img src={formData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div 
                          onClick={(e) => { e.preventDefault(); setFormData({ ...formData, image: '' }); }}
                          style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.5)', cursor: 'pointer', color: 'white', borderRadius: '50%', padding: '2px' }}
                        >
                          <X size={12} />
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                        <label 
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }} 
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} 
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={(e) => { e.preventDefault(); openCamera(); }}
                        >
                          <Camera size={16} color="var(--text-main)" />
                          <span style={{ fontSize: '0.5rem', marginTop: '0.2rem', color: 'var(--text-main)', fontWeight: 'bold' }}>CAMERA</span>
                        </label>
                        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontSize: '1rem', lineHeight: '1' }}>🖼️</span>
                          <span style={{ fontSize: '0.5rem', marginTop: '0.2rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>GALLERY</span>
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="form-group">
              <label className="form-label">{t.namePlace}</label>
              <input className="form-input" placeholder={t.namePlace} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">{t.locationPlace}</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input className="form-input" style={{ width: '100%' }} placeholder={t.locationPlace} value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }} onClick={handleDetectLocation} disabled={isDetecting}>
                      <Navigation size={14} className={isDetecting ? 'animate-pulse' : ''} /> {isDetecting ? 'Detecting...' : t.detectLocation}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }} onClick={() => setShowMap(true)}>
                      <MapPin size={14} /> {t.pinLocation}
                    </button>
                  </div>
                </div>

                <div style={{ width: '130px', height: '100px', flexShrink: 0 }}>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    width: '100%', 
                    height: '100%', 
                    border: '2px dashed var(--border)', 
                    borderRadius: '0.5rem', 
                    position: 'relative',
                    overflow: 'hidden',
                    background: formData.image ? 'none' : 'rgba(0,0,0,0.02)'
                  }}>
                    {formData.image ? (
                      <>
                        <img src={formData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div 
                          onClick={(e) => { e.preventDefault(); setFormData({ ...formData, image: '' }); }}
                          style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', cursor: 'pointer', color: 'white', borderRadius: '50%', padding: '4px' }}
                        >
                          <X size={16} />
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                        <label 
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }} 
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} 
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={(e) => { e.preventDefault(); openCamera(); }}
                        >
                          <Camera size={20} color="var(--text-main)" />
                          <span style={{ fontSize: '0.65rem', marginTop: '0.4rem', color: 'var(--text-main)', fontWeight: 'bold' }}>CAMERA</span>
                        </label>
                        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontSize: '1.25rem', lineHeight: '1' }}>🖼️</span>
                          <span style={{ fontSize: '0.65rem', marginTop: '0.4rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>GALLERY</span>
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t.descPlace}</label>
              <textarea 
                className="form-input" 
                rows="4" 
                placeholder={t.descPlace}
                value={formData.complaintText} 
                onChange={e => setFormData({...formData, complaintText: e.target.value})}
              ></textarea>
            </div>
          </div>
        )}

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', marginTop: '1rem' }} 
          disabled={isSubmitting}
          onClick={submitComplaint}
        >
          {isSubmitting ? t.processing : <span><Send size={18} /> {t.submitBtn}</span>}
        </button>
        {showMap && (
          <MapPicker 
            initialCoords={coords}
            onSelect={(loc, newCoords) => { 
                setFormData({...formData, location: loc}); 
                if (newCoords) {
                  setCoords(newCoords);
                  setGpsCapturedAt(Date.now());
                }
                setShowMap(false); 
            }} 
            onClose={() => setShowMap(false)} 
          />
        )}

        {isCameraOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            background: 'black',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            <div style={{
              position: 'absolute',
              bottom: '40px',
              display: 'flex',
              gap: '2rem',
              alignItems: 'center'
            }}>
              <button 
                className="btn btn-secondary" 
                style={{ borderRadius: '50%', width: '50px', height: '50px', padding: 0 }}
                onClick={closeCamera}
              >
                <X size={24} />
              </button>
              
              <button 
                onClick={takePhoto}
                style={{
                  width: '70px',
                  height: '70px',
                  borderRadius: '50%',
                  background: 'white',
                  border: '5px solid rgba(255,255,255,0.3)',
                  cursor: 'pointer'
                }}
              />
              
              <div style={{ width: '50px' }} /> {/* Spacer */}
            </div>
          </div>
        )}
        {isSubmitting && (
          <div className="ai-loader-overlay">
            <div className="ai-loader-card">
              <div className="ai-brain-container">
                <div className="ai-brain-pulse"></div>
                <Brain color="var(--primary)" size={52} strokeWidth={1.5} />
                <Sparkles 
                  color="var(--warning)" 
                  size={24} 
                  style={{ position: 'absolute', top: -10, right: -10, animation: 'bounce 2s infinite' }} 
                />
              </div>
              <div className="ai-status-text">
                <div className="animate-fade-in" key={loaderIndex}>
                  {loaderMessages[loaderIndex]}
                </div>
              </div>
              <div className="ai-scanner">
                <div className="ai-scanner-bar"></div>
              </div>
              <div className="ai-status-sub" style={{ opacity: 0.6, fontSize: '0.75rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Agentic Processing Platform
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
