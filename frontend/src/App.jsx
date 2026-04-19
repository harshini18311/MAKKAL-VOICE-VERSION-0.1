import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Auth from './components/Auth';
import CitizenPortal from './components/CitizenPortal';
import AdminDashboard from './components/AdminDashboard';
import DepartmentDashboard from './components/DepartmentDashboard';
import './index.css';

// ─── Animated background ────────────────────────────────────────────────────
function AnimatedBackground() {
  const particles = Array.from({ length: 35 }, (_, i) => ({
    id: i,
    size:  Math.random() * 2.5 + 1.2,
    left:  `${Math.random() * 100}%`,
    top:   `${Math.random() * 100}%`,
    dur:   `${Math.random() * 10 + 8}s`,
    delay: `${-(Math.random() * 15)}s`,
  }));

  return (
    <div className="bg-canvas" aria-hidden="true">
      {/* Aurora Flux Layers */}
      <div className="aurora-layer aurora-1" />
      <div className="aurora-layer aurora-2" />
      <div className="aurora-layer aurora-3" />
      
      <div className="bg-particles">
        {particles.map(p => (
          <div
            key={p.id}
            className="particle"
            style={{
              width:   p.size,
              height:  p.size,
              left:    p.left,
              top:     p.top,
              '--dur':   p.dur,
              '--delay': p.delay,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────
function App() {
  const [lang, setLang] = useState('en');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth';
  };

  const getUserData = () => {
    try {
      const s = localStorage.getItem('user');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  };

  const user         = getUserData();
  const isAdmin      = user?.email === 'admin@issue' || user?.role === 'admin';
  const isDepartment = user?.role === 'department';

  const notAuthorized = (msg = 'Please login to view this page.') => (
    <div style={{ textAlign: 'center', marginTop: '5rem' }}>
      <h2>Not Authorized</h2>
      <p>{msg}</p>
    </div>
  );

  return (
    <Router>
      <AnimatedBackground />

      {/* ── Navbar ── */}
      <nav className="navbar">
        <Link to="/" className="nav-logo">MAKKAL VOICE</Link>

        <div className="nav-links">
          <select
            className="form-input"
            style={{ width: 'auto', padding: '0.3rem 0.65rem', height: 'auto', fontSize: '0.85rem' }}
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

          {!isDepartment && !isAdmin && <Link to="/">Portal</Link>}
          {isAdmin      && <Link to="/admin">Admin</Link>}
          {isDepartment && (
            <Link to="/department" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              🏛️ {user?.department || 'Department'}
            </Link>
          )}

          {localStorage.getItem('token') ? (
            <button
              className="btn btn-secondary"
              style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
              onClick={handleLogout}
            >
              Logout
            </button>
          ) : (
            <Link to="/auth" className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* ── Pages ── */}
      <div className="app-container animate-fade-in">
        <Routes>
          <Route path="/auth"       element={<Auth lang={lang} />} />
          <Route path="/"           element={<CitizenPortal lang={lang} />} />

          <Route path="/admin" element={(() => {
            const u = getUserData();
            if (!u) return notAuthorized('Please login as Admin to view this page.');
            if (u.email === 'admin@issue' || u.role === 'admin') return <AdminDashboard />;
            return notAuthorized('Please login as Admin to view this page.');
          })()} />

          <Route path="/department" element={(() => {
            const u = getUserData();
            if (!u) return notAuthorized('Please login as a Department user.');
            if (u.role === 'department') return <DepartmentDashboard />;
            return notAuthorized('Please login as a Department user.');
          })()} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
