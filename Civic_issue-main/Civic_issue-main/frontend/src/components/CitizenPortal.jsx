import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Mic, Square, Send, CheckCircle, MapPin, Navigation } from 'lucide-react';
import { translations } from '../utils/translations';
import MapPicker from './MapPicker';

export default function CitizenPortal({ lang }) {
  const [activeTab, setActiveTab] = useState('voice'); // voice or text
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', location: '', complaintText: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  
  const t = translations[lang] || translations.en;
  
  // Real-time voice transcript
  const [voiceText, setVoiceText] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);

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

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({ ...prev, location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }));
      },
      (error) => {
        alert("Unable to retrieve location: " + error.message);
      }
    );
  };

  const submitComplaint = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('You must be logged in to submit a complaint.');
      return;
    }

    if (!formData.name || !formData.location || (activeTab === 'voice' && !voiceText) || (activeTab === 'text' && !formData.complaintText)) {
      alert(t.validationError);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const url = `http://localhost:5000/api/complaint`;
      let payload;
      let headers = { Authorization: `Bearer ${token}` };

      if (activeTab === 'voice') {
        if (!voiceText) return alert('No speech was detected. Please try speaking louder.');
        if (photoFile) {
          const form = new FormData();
          form.append('text', voiceText);
          form.append('name', formData.name);
          form.append('location', formData.location);
          form.append('photo', photoFile);
          payload = form;
        } else {
          // Bypass backend audio parser and send recognized text directly.
          payload = { text: voiceText, name: formData.name, location: formData.location };
          headers['Content-Type'] = 'application/json';
        }
      } else {
        const form = new FormData();
        form.append('name', formData.name);
        form.append('location', formData.location);
        form.append('text', formData.complaintText);
        if (photoFile) {
          form.append('photo', photoFile);
        }
        payload = form;
      }

      const { data } = await axios.post(url, payload, { headers });
      setResult(data);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit complaint');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
        <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
          <CheckCircle size={48} color="var(--secondary)" style={{ margin: '0 auto 1rem' }} />
          <h2>Complaint Registered!</h2>
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
                Score: {typeof result.fraudScore === 'number' ? result.fraudScore : 0}/100
              </span>
            </div>
            <div className="fraud-bar-track" style={{ marginTop: '0.5rem' }}>
              <div 
                className="fraud-bar-fill"
                style={{ 
                  width: `${typeof result.fraudScore === 'number' ? result.fraudScore : 0}%`,
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
          </div>
          <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => { setResult(null); setAudioBlob(null); setPhotoFile(null); setFormData({name:'', location:'', complaintText:''}); }}>
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
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button 
            className={`btn ${activeTab === 'voice' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1 }} 
            onClick={() => setActiveTab('voice')}
          >
            <Mic size={18} /> {t.voiceTab}
          </button>
          <button 
            className={`btn ${activeTab === 'text' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1 }} 
            onClick={() => setActiveTab('text')}
          >
            {t.textTab}
          </button>
        </div>

        {activeTab === 'voice' ? (
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
              <input
                className="form-input"
                type="file"
                accept="image/*"
                onChange={e => setPhotoFile(e.target.files?.[0] || null)}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Optional: Add a complaint photo for fake detection checks
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input className="form-input" style={{ flex: 1 }} placeholder={t.locationPlace} value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }} onClick={handleDetectLocation}>
                    <Navigation size={14} /> {t.detectLocation}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }} onClick={() => setShowMap(true)}>
                    <MapPin size={14} /> {t.pinLocation}
                  </button>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input className="form-input" style={{ flex: 1 }} placeholder={t.locationPlace} value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handleDetectLocation}>
                    <Navigation size={14} /> {t.detectLocation}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowMap(true)}>
                    {t.pinLocation}
                  </button>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Complaint Photo (Optional)</label>
              <input
                className="form-input"
                type="file"
                accept="image/*"
                onChange={e => setPhotoFile(e.target.files?.[0] || null)}
              />
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
            onSelect={(loc) => { setFormData({...formData, location: loc}); setShowMap(false); }} 
            onClose={() => setShowMap(false)} 
          />
        )}
      </div>
    </div>
  );
}
