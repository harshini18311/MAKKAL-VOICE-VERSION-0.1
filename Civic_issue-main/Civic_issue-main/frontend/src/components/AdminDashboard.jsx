import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterFraud, setFilterFraud] = useState('All');

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('http://localhost:5000/api/complaint', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setComplaints(data);
    } catch (error) {
      alert('Error fetching complaints. Make sure you are logged in.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const newStatus = currentStatus === 'Pending' ? 'Resolved' : 'Pending';
      await axios.put(`http://localhost:5000/api/complaint/${id}`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchComplaints();
    } catch (error) {
      alert('Failed to update status');
    }
  };

  const toggleExpand = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getFraudBadgeClass = (status) => {
    switch (status) {
      case 'Flagged': return 'fraud-badge fraud-flagged';
      case 'Suspicious': return 'fraud-badge fraud-suspicious';
      case 'Review': return 'fraud-badge fraud-suspicious';
      default: return 'fraud-badge fraud-clean';
    }
  };

  const getFraudBarColor = (score) => {
    if (score >= 61) return 'var(--danger)';
    if (score >= 31) return '#f59e0b';
    return 'var(--secondary)';
  };

  const filtered = complaints.filter(c => {
    if (filterStatus !== 'All' && c.status !== filterStatus) return false;
    if (filterCategory !== 'All' && c.category !== filterCategory) return false;
    if (filterFraud !== 'All' && c.fraudStatus !== filterFraud) return false;
    return true;
  });

  if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading Admin Portal...</div>;

  return (
    <div style={{ marginTop: '2rem' }} className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2>Agentic Dashboard</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 'auto' }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="All">All Categories</option>
            <option value="Water">Water</option>
            <option value="Electricity">Electricity</option>
            <option value="Road">Road</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Public Safety">Public Safety</option>
            <option value="Sanitation">Sanitation</option>
            <option value="Government Services">Gov Services</option>
            <option value="Rural specific">Rural</option>
            <option value="Other">Other</option>
          </select>
          <select className="form-input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Resolved">Resolved</option>
          </select>
          <select className="form-input" style={{ width: 'auto' }} value={filterFraud} onChange={e => setFilterFraud(e.target.value)}>
            <option value="All">All Fraud Levels</option>
            <option value="Clean">🟢 Clean</option>
            <option value="Suspicious">🟡 Suspicious</option>
            <option value="Flagged">🔴 Flagged</option>
          </select>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1rem' }}>Tracking ID</th>
              <th style={{ padding: '1rem' }}>Category</th>
              <th style={{ padding: '1rem' }}>Priority</th>
              <th style={{ padding: '1rem' }}>Location</th>
              <th style={{ padding: '1rem' }}>AI Summary</th>
              <th style={{ padding: '1rem' }}>Fraud Check</th>
              <th style={{ padding: '1rem' }}>Email Draft</th>
              <th style={{ padding: '1rem' }}>Status</th>
              <th style={{ padding: '1rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="9" style={{ padding: '2rem', textAlign: 'center' }}>No complaints found.</td></tr>
            ) : filtered.map(c => {
              const score = typeof c.fraudScore === 'number' ? c.fraudScore : 0;
              const isExpanded = expandedRows[c._id];
              return (
                <React.Fragment key={c._id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{c.trackingId}</td>
                    <td style={{ padding: '1rem' }}>{c.category}</td>
                    <td style={{ padding: '1rem', color: c.priority === 'High' ? 'var(--danger)' : 'inherit' }}>{c.priority}</td>
                    <td style={{ padding: '1rem' }}>
                      {c.location && c.location.includes(',') ? (
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location)}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                        >
                          {c.location}
                        </a>
                      ) : (
                        c.location || 'N/A'
                      )}
                    </td>
                    <td style={{ padding: '1rem', maxWidth: '250px', fontSize: '0.875rem' }}>{c.summary}</td>
                    <td style={{ padding: '1rem', minWidth: '160px' }}>
                      <span className={getFraudBadgeClass(c.fraudStatus)}>
                        {c.fraudStatus || 'Clean'}
                      </span>
                      {/* Progress bar */}
                      <div className="fraud-bar-track">
                        <div 
                          className="fraud-bar-fill"
                          style={{ width: `${score}%`, background: getFraudBarColor(score) }}
                        />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{score}/100</span>
                      <div style={{ marginTop: '0.35rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                          onClick={() => toggleExpand(c._id)}
                        >
                          {isExpanded ? 'Hide Reasons' : 'View Reasons'}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => alert(`Formal Email Draft:\n\n${c.emailDraft || 'Draft not available for this entry.'}`)}
                      >
                        View Draft
                      </button>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600',
                        background: c.status === 'Resolved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: c.status === 'Resolved' ? 'var(--secondary)' : 'var(--danger)'
                      }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.5rem', fontSize: '0.875rem' }} onClick={() => toggleStatus(c._id, c.status)}>
                        {c.status === 'Pending' ? 'Mark Resolved' : 'Reopen'}
                      </button>
                    </td>
                  </tr>
                  {/* Expandable fraud reasons panel */}
                  {isExpanded && (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan="9" style={{ padding: '0' }}>
                        <div className="fraud-panel animate-fade-in">
                          <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                            Fraud Detection Signals — Score: {score}/100
                          </strong>
                          {(c.fraudReasons || []).length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
                              {c.fraudReasons.map((reason, i) => (
                                <li key={i} style={{ 
                                  fontSize: '0.8rem', 
                                  marginBottom: '0.25rem',
                                  color: reason.startsWith('[AI]') ? '#7c3aed' : 'var(--text-main)'
                                }}>
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No suspicious patterns detected.</p>
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
    </div>
  );
}
