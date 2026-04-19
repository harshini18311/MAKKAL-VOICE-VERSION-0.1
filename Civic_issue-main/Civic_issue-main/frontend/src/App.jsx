import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import CitizenPortal from './components/CitizenPortal';
import AdminDashboard from './components/AdminDashboard';
import './index.css';

function App() {
  const [lang, setLang] = useState('en');

  const getStoredUser = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Invalid stored user JSON', error);
      return null;
    }
  };

  const isAdminUser = () => {
    const user = getStoredUser();
    if (!user) return false;
    return user.isAdmin === true || user.email === 'admin@issue';
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/auth';
  };

  return (
    <Router>
      <nav className="navbar">
        <Link to="/" className="nav-logo">CivicVoice AI</Link>
        <div className="nav-links">
          <select 
            className="form-input" 
            style={{ width: 'auto', padding: '0.2rem 0.5rem', height: 'auto', fontSize: '0.875rem' }} 
            value={lang} 
            onChange={e => setLang(e.target.value)}
          >
            <option value="en">English</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="te">తెలుగు (Telugu)</option>
            <option value="mr">मराठी (Marathi)</option>
            <option value="ml">മലയാളം (Malayalam)</option>
          </select>
          <Link to="/">Portal</Link>
          {isAdminUser() && (
            <Link to="/admin">Admin</Link>
          )}
          {localStorage.getItem('token') ? (
            <button className="btn btn-secondary" style={{padding: '0.4rem 1rem'}} onClick={handleLogout}>Logout</button>
          ) : (
            <Link to="/auth" className="btn btn-primary" style={{padding: '0.4rem 1rem'}}>Login</Link>
          )}
        </div>
      </nav>
      
      <div className="app-container animate-fade-in">
        <Routes>
          <Route path="/auth" element={<Auth lang={lang} />} />
          <Route path="/" element={<CitizenPortal lang={lang} />} />
          <Route path="/admin" element={(() => {
            if (isAdminUser()) return <AdminDashboard />;
            return <div style={{textAlign: 'center', marginTop: '4rem'}}><h2>Not Authorized</h2><p>Please login as Admin to view this page.</p></div>;
          })()} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
