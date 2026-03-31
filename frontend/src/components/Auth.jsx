import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Phone, Lock, User } from 'lucide-react';
import { translations } from '../utils/translations';

export default function Auth({ lang }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', otp: '' });
  const [step, setStep] = useState('details'); // 'details' or 'otp'
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const t = translations[lang] || translations.en;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const contact = formData.email || formData.phone;

      // Registration Flow: Step 1 (Send OTP)
      if (!isLogin && step === 'details') {
        setIsSendingOtp(true);
        await axios.post('http://localhost:5000/api/auth/send-otp', { contact });
        setStep('otp');
        setIsSendingOtp(false);
        return;
      }

      // Registration Flow: Step 2 (Verify & Create) OR Login Flow
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const url = `http://localhost:5000${endpoint}`;
      
      const payload = { ...formData };
      if (!payload.email) delete payload.email;
      if (!payload.phone) delete payload.phone;

      const { data } = await axios.post(url, payload);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data));
      
      if (data.role === 'admin' || data.email === 'admin@issue') {
        window.location.href = '/admin';
      } else if (data.role === 'department') {
        window.location.href = '/department';
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      setIsSendingOtp(false);
      const msg = error.response?.data?.error || error.message || 'Authentication Failed';
      setErrorMsg(msg);
      console.error('Auth Error:', error.response?.data || error);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          {isLogin ? t.authTitleLogin : t.authTitleRegister}
        </h2>
        
        {errorMsg && (
          <div className="animate-fade-in" style={{ background: '#fef2f2', color: '#dc2626', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem', borderLeft: '4px solid #dc2626' }}>
            <strong>Error:</strong> {errorMsg}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {step === 'details' ? (
            <>
              {!isLogin && (
                <div className="form-group">
                  <label className="form-label"><User size={16} /> {t.nameLabel}</label>
                  <input 
                    className="form-input" 
                    placeholder="Ramesh Kumar" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    required={!isLogin}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label"><Phone size={16} /> {t.phoneEmailLabel}</label>
                <input 
                  className="form-input" 
                  placeholder="Email or Phone Number" 
                  value={formData.email || formData.phone}
                  onChange={e => {
                    const val = e.target.value;
                    if(val.includes('@')) {
                      setFormData({...formData, email: val, phone: ''});
                    } else {
                      setFormData({...formData, phone: val, email: ''});
                    }
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label"><Lock size={16} /> {t.passwordLabel}</label>
                <input 
                  type="password"
                  className="form-input" 
                  placeholder="••••••••" 
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  required
                />
              </div>
            </>
          ) : (
            <div className="form-group animate-slide-up">
              <label className="form-label">{t.otpLabel}</label>
              <input 
                className="form-input" 
                placeholder="XXXX" 
                maxLength={4}
                style={{ textAlign: 'center', letterSpacing: '0.5rem', fontSize: '1.25rem' }}
                value={formData.otp}
                onChange={e => setFormData({...formData, otp: e.target.value.replace(/\D/g,'')})}
                required
              />
              <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                {t.otpCheck}
              </p>
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.75rem' }} onClick={() => setStep('details')}>
                {t.backBtn}
              </button>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={isSendingOtp}>
            {isSendingOtp ? '...' : (isLogin ? t.loginBtn : (step === 'details' ? t.verifyOtpBtn || 'Verify via OTP' : t.finalizeBtn || 'Finalize Registration'))}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.2rem 0.5rem', border: 'none', background: 'transparent', color: 'var(--primary)' }}
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  );
}
