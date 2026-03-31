import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import CitizenPortal from './components/CitizenPortal';
import AdminDashboard from './components/AdminDashboard';
import DepartmentDashboard from './components/DepartmentDashboard';
import './index.css';

function App() {
  const [lang, setLang] = useState('en');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth';
  };

  const getUserData = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch { return null; }
  };

  const user = getUserData();
  const isAdmin = user?.email === 'admin@issue' || user?.role === 'admin';
  const isDepartment = user?.role === 'department';

  return (
    <Router>
      <nav className="navbar">
        <Link to="/" className="nav-logo">MAKKAL VOICE</Link>
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

          {!isDepartment && !isAdmin && (
            <Link to="/">Portal</Link>
          )}
          {isAdmin && (
            <Link to="/admin">Admin</Link>
          )}
          {isDepartment && (
            <Link to="/department" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              🏛️ {user?.department || 'Department'}
            </Link>
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
          
          {/* Admin Route */}
          <Route path="/admin" element={(() => {
            const u = getUserData();
            if (!u) return <div style={{textAlign: 'center', marginTop: '4rem'}}><h2>Not Authorized</h2><p>Please login as Admin to view this page.</p></div>;
            if (u.email === 'admin@issue' || u.role === 'admin') return <AdminDashboard />;
            return <div style={{textAlign: 'center', marginTop: '4rem'}}><h2>Not Authorized</h2><p>Please login as Admin to view this page.</p></div>;
          })()} />

          {/* Department Route */}
          <Route path="/department" element={(() => {
            const u = getUserData();
            if (!u) return <div style={{textAlign: 'center', marginTop: '4rem'}}><h2>Not Authorized</h2><p>Please login as a Department user.</p></div>;
            if (u.role === 'department') return <DepartmentDashboard />;
            return <div style={{textAlign: 'center', marginTop: '4rem'}}><h2>Not Authorized</h2><p>Please login as a Department user.</p></div>;
          })()} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
