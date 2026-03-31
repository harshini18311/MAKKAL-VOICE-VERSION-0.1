import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:5000/api/complaint';

export default function DepartmentDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [resolutionImage, setResolutionImage] = useState('');
  const [updating, setUpdating] = useState(false);
  const [escalationData, setEscalationData] = useState({});
  const [updatingEscalation, setUpdatingEscalation] = useState(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    try {
      const { data } = await axios.get(`${API}/department/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setComplaints(data);
    } catch (error) {
      alert('Error fetching department complaints.');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    if (newStatus === 'Resolved' && !resolutionImage) {
      alert('Proof of work (photo) is required to mark this complaint as resolved.');
      return;
    }

    setUpdating(true);
    try {
      await axios.put(`${API}/${id}/department-update`, {
        status: newStatus,
        response: responseText || undefined,
        resolutionImage: newStatus === 'Resolved' ? resolutionImage : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedComplaint(null);
      setResponseText('');
      setResolutionImage('');
      fetchComplaints();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setResolutionImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEscalationChange = (complaintId, escalationId, field, value) => {
    const key = `${complaintId}_${escalationId}`;
    setEscalationData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || { answerReason: '', answerMessage: '', answerImage: '' }),
        [field]: value
      }
    }));
  };

  const handleEscalationImageUpload = (complaintId, escalationId, e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleEscalationChange(complaintId, escalationId, 'answerImage', reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitEscalationReply = async (complaintId, escalationId) => {
    const key = `${complaintId}_${escalationId}`;
    const data = escalationData[key];
    if (!data) return;

    if (data.answerReason !== 'others' && !data.answerImage) {
      alert('Photo proof is required for this answer.');
      return;
    }

    setUpdatingEscalation(key);
    try {
      await axios.put(`${API}/${complaintId}/escalate/${escalationId}/reply`, {
        answerReason: data.answerReason,
        answerMessage: data.answerMessage,
        answerImage: data.answerImage
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Escalation response submitted successfully!');
      
      // Clear data for this escalation
      setEscalationData(prev => {
        const newData = { ...prev };
        delete newData[key];
        return newData;
      });
      
      fetchComplaints();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit response');
    } finally {
      setUpdatingEscalation(null);
    }
  };

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

  const daysAgo = (date) => {
    const ms = Date.now() - new Date(date).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  };

  const priorityColor = (p) => {
    if (p === 'High') return '#dc2626';
    if (p === 'Medium') return '#d97706';
    return '#059669';
  };

  if (loading) return (
    <div style={{ textAlign: 'center', marginTop: '4rem' }}>
      <div className="loading-spinner"></div>
      <p style={{ marginTop: '1rem' }}>Loading Department Portal...</p>
    </div>
  );

  const pending = complaints.filter(c => ['Pending', 'QueuedReview'].includes(c.status));
  const inProgress = complaints.filter(c => c.status === 'InProgress');
  const resolved = complaints.filter(c => c.status === 'Resolved');

  return (
    <div style={{ marginTop: '1.5rem' }} className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
          <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '0.75rem'
          }}>
            🏛️ {user.department} Department
          </span>
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
          Manage and resolve complaints assigned to your department
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary)' }}>{complaints.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Total Complaints</div>
        </div>
        <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#dc2626' }}>{pending.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Pending</div>
        </div>
        <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#d97706' }}>{inProgress.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>In Progress</div>
        </div>
        <div className="glass-card dept-stat-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#059669' }}>{resolved.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Resolved</div>
        </div>
      </div>

      {/* Escalation Notifications */}
      {complaints.filter(c => c.escalations && c.escalations.length > 0 && c.status !== 'Resolved').map(c => (
        <React.Fragment key={c._id + '-esc-frag'}>
          {c.escalations.filter(e => !e.answeredAt).map((e, i) => {
             const escKey = `${c._id}_${e._id}`;
             const replyData = escalationData[escKey] || { answerReason: '', answerMessage: '', answerImage: '' };
             
             return (
               <div key={escKey} className="glass-card escalation-notification" style={{ marginBottom: '1rem', borderLeft: '4px solid #f59e0b', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                    <strong style={{ fontSize: '1.05rem', color: '#b45309' }}>Action Required: Admin Escalation — {c.trackingId}</strong>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '1rem', paddingLeft: '2rem' }}>
                    <em>"{e.message}"</em> — <span style={{ color: 'var(--text-muted)' }}>{new Date(e.raisedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', marginLeft: '2rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Department Response</h4>
                    
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <select 
                        className="form-input" 
                        value={replyData.answerReason}
                        onChange={(ev) => handleEscalationChange(c._id, e._id, 'answerReason', ev.target.value)}
                        style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                      >
                        <option value="">-- Select Response Reason --</option>
                        <option value="already resolved">Already Resolved</option>
                        <option value="no such problem exist">No Such Problem Exist</option>
                        <option value="others">Others (Requires Descriptive Message)</option>
                      </select>
                    </div>

                    {(replyData.answerReason === 'already resolved' || replyData.answerReason === 'no such problem exist') && (
                      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Photo Proof (Required) 📸</label>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <label className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', textAlign: 'center', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}>
                            📷 Camera
                            <input type="file" accept="image/*" capture="environment" onChange={(ev) => handleEscalationImageUpload(c._id, e._id, ev)} style={{ display: 'none' }} />
                          </label>
                          <label className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', textAlign: 'center', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}>
                            🖼️ Gallery
                            <input type="file" accept="image/*" onChange={(ev) => handleEscalationImageUpload(c._id, e._id, ev)} style={{ display: 'none' }} />
                          </label>
                        </div>
                        {replyData.answerImage && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <img src={replyData.answerImage} alt="Proof" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                          </div>
                        )}
                      </div>
                    )}

                    {replyData.answerReason === 'others' && (
                      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Descriptive Message (Required)</label>
                        <textarea
                          className="form-input"
                          rows={2}
                          placeholder="Please provide details..."
                          value={replyData.answerMessage}
                          onChange={(ev) => handleEscalationChange(c._id, e._id, 'answerMessage', ev.target.value)}
                          style={{ padding: '0.5rem', fontSize: '0.85rem', resize: 'vertical' }}
                        />
                      </div>
                    )}

                    <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', opacity: (updatingEscalation === escKey ? 0.7 : 1) }}
                        disabled={updatingEscalation === escKey || !replyData.answerReason || 
                          (replyData.answerReason === 'others' && !replyData.answerMessage) || 
                          (replyData.answerReason !== 'others' && !replyData.answerImage)}
                        onClick={() => submitEscalationReply(c._id, e._id)}
                      >
                        {updatingEscalation === escKey ? 'Submitting...' : 'Submit Response'}
                      </button>
                    </div>
                  </div>
               </div>
             );
          })}
        </React.Fragment>
      ))}

      {/* Complaints Table */}
      <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Tracking ID</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Date Filed</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Citizen</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Location</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Summary</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Priority</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Status</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Days Open</th>
              <th style={{ padding: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {complaints.length === 0 ? (
              <tr><td colSpan="9" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No complaints assigned to your department yet.</td></tr>
            ) : complaints.map(c => (
              <tr key={c._id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(79, 70, 229, 0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '0.85rem 1rem', fontWeight: '600', fontSize: '0.85rem', fontFamily: 'monospace' }}>{c.trackingId}</td>
                <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>{new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>{c.name || c.user?.name || 'Anonymous'}</td>
                <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.location || 'N/A'}</td>
                <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.summary || c.complaintText?.substring(0, 80)}</td>
                <td style={{ padding: '0.85rem 1rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: priorityColor(c.priority) }}>{c.priority}</span>
                </td>
                <td style={{ padding: '0.85rem 1rem' }}>
                  <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600',
                    ...statusBadge(c.status)
                  }}>
                    {c.status}
                  </span>
                  {c.escalations && c.escalations.length > 0 && c.status !== 'Resolved' && (
                    <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem' }}>⚠️</span>
                  )}
                </td>
                <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', fontWeight: '500' }}>
                  <span style={{ color: daysAgo(c.createdAt) > 7 ? '#dc2626' : 'var(--text-main)' }}>
                    {c.status === 'Resolved' ? '—' : `${daysAgo(c.createdAt)}d`}
                  </span>
                </td>
                <td style={{ padding: '0.85rem 1rem' }}>
                  {c.status === 'Resolved' ? (
                    <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '500' }}>✅ Done</span>
                  ) : c.status === 'Rejected' || c.status === 'Merged' ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {c.status !== 'InProgress' && (
                        <button className="btn dept-action-btn" style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem', fontSize: '0.7rem', border: '1px solid #fcd34d' }}
                          onClick={() => updateStatus(c._id, 'InProgress')}>
                          In Progress
                        </button>
                      )}
                      <button className="btn dept-action-btn" style={{ background: '#d1fae5', color: '#065f46', padding: '0.25rem 0.5rem', fontSize: '0.7rem', border: '1px solid #6ee7b7' }}
                        onClick={() => setSelectedComplaint(c)}>
                        Resolve
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resolve Modal */}
      {selectedComplaint && (
        <div className="modal-overlay" onClick={() => { setSelectedComplaint(null); setResolutionImage(''); setResponseText(''); }}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%' }}>
            <h3 style={{ marginBottom: '1rem' }}>Resolve Complaint</h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <strong>Tracking ID:</strong> {selectedComplaint.trackingId}
            </p>
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
              {selectedComplaint.summary}
            </p>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Proof of Work (Required) 📸</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <label className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', textAlign: 'center', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}>
                  📷 Use Camera
                  <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>
                <label className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', textAlign: 'center', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}>
                  🖼️ Upload Photo
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>
              </div>
              {resolutionImage && (
                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <img src={resolutionImage} alt="Proof" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Response Note (optional)</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Describe the action taken to resolve this complaint..."
                value={responseText}
                onChange={e => setResponseText(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setSelectedComplaint(null); setResponseText(''); setResolutionImage(''); }}>Cancel</button>
              <button className="btn btn-primary" disabled={updating || !resolutionImage} onClick={() => updateStatus(selectedComplaint._id, 'Resolved')}>
                {updating ? 'Updating...' : '✅ Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
