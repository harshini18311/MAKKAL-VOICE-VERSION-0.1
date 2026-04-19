import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:5000/api/complaint';

const DEPARTMENT_META = {
  'Water':               { icon: '💧', gradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)' },
  'Road':                { icon: '🛣️', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  'Electricity':         { icon: '⚡', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  'Sanitation':          { icon: '🧹', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  'Traffic':             { icon: '🚦', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)' },
  'Public Safety':       { icon: '🛡️', gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
  'Infrastructure':      { icon: '🏗️', gradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
  'Government Services': { icon: '🏛️', gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
  'Rural specific':      { icon: '🌾', gradient: 'linear-gradient(135deg, #84cc16, #65a30d)' },
  'Other':               { icon: '📋', gradient: 'linear-gradient(135deg, #64748b, #475569)' }
};

export default function AdminDashboard() {
  const [view, setView] = useState('departments'); // 'departments' or 'detail'
  const [summary, setSummary] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [escalateModal, setEscalateModal] = useState(null);
  const [escalateMsg, setEscalateMsg] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [fraudInfo, setFraudInfo] = useState({ total: 0, flagged: 0 });

  const toggleExpand = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getFraudBadgeStyle = (status, score) => {
    const match = 100 - (score || 0);
    if (status === 'Flagged' || match < 40) return {
      background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)'
    };
    if (status === 'Suspicious' || match < 70) return {
      background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)'
    };
    return { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)' };
  };

  const getMatchLabel = (status) => {
    if (status === 'Flagged') return '⚠ Review';
    if (status === 'Suspicious') return '~ Suspect';
    return '✓ Clear';
  };

  const getFraudBarColor = (score) => {
    const match = 100 - score;
    if (match <= 39) return 'linear-gradient(90deg, #ef4444, #dc2626)';
    if (match <= 69) return 'linear-gradient(90deg, #f59e0b, #d97706)';
    return 'linear-gradient(90deg, #10b981, #059669)';
  };

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const [{ data: summaryData }, { data: allComplaints }] = await Promise.all([
        axios.get(`${API}/departments/summary`, { headers }),
        axios.get(API, { headers })
      ]);
      setSummary(summaryData);

      // Extract replied escalations
      const replies = [];
      allComplaints.forEach(c => {
        if (c.escalations && c.escalations.length > 0) {
          c.escalations.forEach(e => {
            if (e.answeredAt) {
              replies.push({
                ...e,
                complaintId: c._id,
                trackingId: c.trackingId,
                department: c.category
              });
            }
          });
        }
      });
      // Sort by newest answer first
      replies.sort((a, b) => new Date(b.answeredAt) - new Date(a.answeredAt));
      setNotifications(replies);

      // Compute global fraud ratio
      const totalFlagged = allComplaints.filter(c => c.fraudStatus === 'Flagged').length;
      setFraudInfo({ total: allComplaints.length, flagged: totalFlagged });
    } catch (error) {
      alert('Error fetching admin data.');
    } finally {
      setLoading(false);
    }
  };

  const openDepartment = async (category) => {
    setSelectedDept(category);
    setDetailLoading(true);
    setView('detail');
    try {
      const { data } = await axios.get(`${API}/by-department/${encodeURIComponent(category)}`, { headers });
      setComplaints(data);
    } catch (error) {
      alert('Error fetching department complaints.');
    } finally {
      setDetailLoading(false);
    }
  };

  const goBack = () => {
    setView('departments');
    setSelectedDept(null);
    setComplaints([]);
    fetchSummary();
  };

  const handleEscalate = async () => {
    if (!escalateMsg.trim()) return alert('Please enter an escalation message.');
    setEscalating(true);
    try {
      await axios.post(`${API}/${escalateModal._id}/escalate`, { message: escalateMsg }, { headers });
      setEscalateModal(null);
      setEscalateMsg('');
      openDepartment(selectedDept);
    } catch (error) {
      alert(error.response?.data?.error || 'Escalation failed');
    } finally {
      setEscalating(false);
    }
  };

  const daysAgo = (date) => Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));

  const statusBadge = (status) => {
    const styles = {
      Resolved: { background: 'rgba(16, 185, 129, 0.12)', color: '#059669' },
      InProgress: { background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' },
      Pending: { background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' },
      QueuedReview: { background: 'rgba(234, 179, 8, 0.15)', color: '#b45309' },
      Rejected: { background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' },
      Related: { background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' },
      Merged: { background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' }
    };
    return styles[status] || styles.Pending;
  };

  if (loading) return (
    <div style={{ textAlign: 'center', marginTop: '4rem' }}>
      <div className="loading-spinner"></div>
      <p style={{ marginTop: '1rem' }}>Loading Admin Dashboard...</p>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // VIEW: Department Cards Grid
  // ═══════════════════════════════════════════════════════════
  if (view === 'departments') {
    const totalComplaints = summary.reduce((a, s) => a + s.total, 0);
    const totalOverdue = summary.reduce((a, s) => a + s.overdue, 0);
    const totalResolved = summary.reduce((a, s) => a + s.resolved, 0);

    // Build full list including departments with 0 complaints
    const allDepts = Object.keys(DEPARTMENT_META);
    const summaryMap = {};
    summary.forEach(s => { summaryMap[s._id] = s; });

    return (
      <div style={{ marginTop: '1.5rem', position: 'relative' }} className="animate-fade-in">
        {/* Header */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>🏢 Admin Command Center</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
              Monitor all departments • Escalate overdue complaints
            </p>
          </div>
          
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setView('notifications')}
              className="btn btn-secondary" 
              style={{ position: 'relative', padding: '0.5rem 1rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer' }}
            >
              🔔
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                  {notifications.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Global Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid var(--primary)' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalComplaints}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.2rem' }}>Total Complaints</div>
          </div>
          <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #059669' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: '800', color: '#059669', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalResolved}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.2rem' }}>Resolved</div>
          </div>
          <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center', borderLeft: `4px solid ${totalOverdue > 0 ? '#dc2626' : '#059669'}` }}>
            <div style={{ fontSize: '2.25rem', fontWeight: '800', color: totalOverdue > 0 ? '#dc2626' : '#059669', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalOverdue}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.2rem' }}>Overdue (&gt;1 day)</div>
          </div>
          <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center', borderLeft: `4px solid ${fraudInfo.flagged > 0 ? '#f59e0b' : '#10b981'}` }}>
            <div style={{ fontSize: '2.25rem', fontWeight: '800', color: fraudInfo.flagged > 0 ? '#f59e0b' : '#10b981', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {fraudInfo.total > 0 ? Math.round((fraudInfo.flagged / fraudInfo.total) * 100) : 0}%
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.2rem' }}>Fraud Flagged</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{fraudInfo.flagged} of {fraudInfo.total}</div>
          </div>
        </div>

        {/* Department Cards */}
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)' }}>Departments</h3>
        <div className="dept-grid">
          {allDepts.map(dept => {
            const s = summaryMap[dept] || { total: 0, pending: 0, resolved: 0, overdue: 0, rejected: 0 };
            const meta = DEPARTMENT_META[dept];
            return (
              <div
                key={dept}
                className="dept-card glass-card"
                onClick={() => openDepartment(dept)}
                style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
              >
                {/* Gradient accent bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: meta.gradient }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', marginTop: '0.5rem' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: meta.gradient, fontSize: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}>
                    {meta.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{dept}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.total} complaints</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Pending: </span>
                    <span style={{ fontWeight: '600', color: s.pending > 0 ? '#d97706' : '#059669' }}>{s.pending}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Resolved: </span>
                    <span style={{ fontWeight: '600', color: '#059669' }}>{s.resolved}</span>
                  </div>
                </div>

                {s.overdue > 0 && (
                  <div className="overdue-badge">
                    {s.overdue} overdue
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW: Notifications Page
  // ═══════════════════════════════════════════════════════════
  if (view === 'notifications') {
    return (
      <div style={{ marginTop: '1.5rem' }} className="animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button className="btn btn-secondary" onClick={goBack} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            ← Back to Dashboard
          </button>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>📬 Department Escalation Replies</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>Review all answered escalations from departments.</p>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '1rem' }}>📭</span>
            No department answers found yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {notifications.map((n, idx) => (
              <div key={idx} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                      {n.department} Department
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary)', fontFamily: 'monospace' }}>
                      {n.trackingId}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    Replied <br/> {new Date(n.answeredAt).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ fontSize: '0.9rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Admin Escalation Query</div>
                  <div style={{ fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>"{n.message}"</div>
                </div>

                <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #d97706', marginTop: 'auto' }}>
                  <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '0.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🗣️</span> 
                    {n.answerReason.toUpperCase()}
                  </div>
                  
                  {n.answerMessage && (
                    <div style={{ color: '#92400e', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                      "{n.answerMessage}"
                    </div>
                  )}

                  {n.answerImage && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '0.25rem' }}>Photo Proof Provided:</div>
                      <img 
                        src={n.answerImage} 
                        alt="Proof" 
                        style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #fcd34d', cursor: 'pointer' }} 
                        onClick={() => {
                          const win = window.open("");
                          win.document.write(`<img src="${n.answerImage}" style="max-width:100%; height:auto;" alt="Proof of Work" />`);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW: Department Drill-Down
  // ═══════════════════════════════════════════════════════════
  const meta = DEPARTMENT_META[selectedDept] || DEPARTMENT_META['Other'];

  return (
    <div style={{ marginTop: '1.5rem' }} className="animate-fade-in">
      {/* Back + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-secondary" onClick={goBack} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: meta.gradient, fontSize: '1.25rem'
          }}>
            {meta.icon}
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{selectedDept} Department</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>{complaints.length} complaints</p>
          </div>
        </div>
      </div>

      {detailLoading ? (
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <div className="loading-spinner"></div>
          <p>Loading complaints...</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Tracking ID</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Registered Date</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Citizen</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Summary</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Priority</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Image Analysis</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Days Open</th>
                <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Escalation</th>
              </tr>
            </thead>
            <tbody>
              {complaints.length === 0 ? (
                <tr><td colSpan="9" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No complaints in this department.</td></tr>
              ) : complaints.map(c => {
                const days = daysAgo(c.createdAt);
                const isOverdue = days >= 1 && !['Resolved', 'Rejected', 'Merged'].includes(c.status);
                const hasEscalation = c.escalations && c.escalations.length > 0;
                const isExpanded = expandedRows[c._id];
                const score = typeof c.fraudScore === 'number' ? c.fraudScore : 0;

                return (
                  <React.Fragment key={c._id}>
                    <tr style={{
                      borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                      background: isOverdue ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: '600', fontSize: '0.8rem', fontFamily: 'monospace' }}>{c.trackingId}</td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                        {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>{c.name || c.user?.name || 'Anonymous'}</td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.summary || c.complaintText?.substring(0, 80)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: c.priority === 'High' ? '#dc2626' : c.priority === 'Medium' ? '#d97706' : '#059669' }}>
                          {c.priority}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', minWidth: '130px' }}>
                        {typeof c.fraudScore === 'number' ? (() => {
                          const match = 100 - score;
                          const badgeStyle = getFraudBadgeStyle(c.fraudStatus, score);
                          const barColor = getFraudBarColor(score);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{
                                  display: 'inline-block', padding: '0.15rem 0.5rem',
                                  borderRadius: '999px', fontSize: '0.68rem', fontWeight: '700',
                                  whiteSpace: 'nowrap', letterSpacing: '0.02em', ...badgeStyle
                                }}>
                                  {getMatchLabel(c.fraudStatus)}
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: 'auto' }}>
                                  {match}%
                                </span>
                              </div>
                              <div style={{ height: '5px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${match}%`, background: barColor, borderRadius: '99px', transition: 'width 0.6s ease' }} />
                              </div>
                              <button
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left', padding: 0, opacity: 0.8 }}
                                onClick={() => toggleExpand(c._id)}
                              >
                                {isExpanded ? '▲ Hide' : '▼ Details'}
                              </button>
                            </div>
                          );
                        })() : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600',
                          ...statusBadge(c.status)
                        }}>
                          {c.status}
                        </span>
                        {c.resolvedAt && c.status === 'Resolved' && (
                          <div style={{ fontSize: '0.65rem', color: '#059669', marginTop: '0.2rem' }}>
                            Resolved: {new Date(c.resolvedAt).toLocaleDateString('en-IN')}
                          </div>
                        )}
                        {c.resolutionImage && c.status === 'Resolved' && (
                          <div style={{ marginTop: '0.4rem' }}>
                            <button 
                              style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', border: '1px solid #10b981', color: '#10b981', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}
                              onClick={() => {
                                const win = window.open("");
                                win.document.write(`<img src="${c.resolutionImage}" style="max-width:100%; height:auto;" alt="Proof of Work" />`);
                              }}
                            >
                              📸 View Proof
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: '600' }}>
                        {c.status === 'Resolved' ? (
                          <span style={{ color: '#059669' }}>—</span>
                        ) : (
                          <span style={{ color: isOverdue ? '#dc2626' : 'var(--text-main)' }}>
                            {days}d {isOverdue && '🔴'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isOverdue ? (
                          <div>
                            <button
                              className="btn escalate-btn"
                              onClick={() => setEscalateModal(c)}
                              style={{
                                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                                color: 'white', padding: '0.3rem 0.65rem', fontSize: '0.7rem',
                                border: 'none', borderRadius: '6px', fontWeight: '600'
                              }}
                            >
                              ⚠ Raise Question
                            </button>
                            {hasEscalation && (
                              <div style={{ fontSize: '0.65rem', color: '#d97706', marginTop: '0.25rem' }}>
                                {c.escalations.length} escalation{c.escalations.length > 1 ? 's' : ''} raised
                              </div>
                            )}
                          </div>
                        ) : c.status === 'Resolved' ? (
                          <span style={{ fontSize: '0.75rem', color: '#059669' }}>✅</span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Not yet eligible</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.01)' }}>
                        <td colSpan="9" style={{ padding: '0' }}>
                          <div className="fraud-panel animate-fade-in" style={{ padding: '1rem 2rem' }}>
                            <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                              🔍 AI Analysis — {100 - score}% visual match
                            </strong>
                            {(c.fraudReasons || []).length > 0 ? (
                              <ul>
                                {c.fraudReasons.map((reason, i) => (
                                  <li key={i} className={reason.startsWith('[AI]') || reason.startsWith('[IMAGE]') || reason.startsWith('[SEMANTIC]') ? 'ai-signal' : ''}>
                                    {reason}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>✅ No suspicious patterns detected.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Escalation Modal */}
      {escalateModal && (
        <div className="modal-overlay" onClick={() => { setEscalateModal(null); setEscalateMsg(''); }}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <h3 style={{ margin: 0 }}>Raise Question to Department</h3>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.06)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Complaint:</strong> {escalateModal.trackingId}</div>
              <div><strong>Filed:</strong> {new Date(escalateModal.createdAt).toLocaleDateString('en-IN')} ({daysAgo(escalateModal.createdAt)} days ago)</div>
              <div><strong>Department:</strong> {selectedDept}</div>
              <div><strong>Status:</strong> {escalateModal.status}</div>
            </div>

            <div className="form-group">
              <label className="form-label">Your question / concern to the department</label>
              <textarea
                className="form-input"
                rows={4}
                placeholder="Why has this complaint not been addressed? Please provide an update on the current status and expected resolution timeline..."
                value={escalateMsg}
                onChange={e => setEscalateMsg(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setEscalateModal(null); setEscalateMsg(''); }}>Cancel</button>
              <button
                className="btn"
                disabled={escalating}
                onClick={handleEscalate}
                style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: 'white', border: 'none' }}
              >
                {escalating ? 'Sending...' : '⚠ Send Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
