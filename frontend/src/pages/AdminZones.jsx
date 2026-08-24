import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { MapPin, Info, RefreshCw, Plus, Edit, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminZones = () => {
  const { token } = useContext(AuthContext);

  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPincodes, setFormPincodes] = useState('');
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchZones = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orders/metadata/zones`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setZones(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Connection failure: zones metadata could not be retrieved.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const openCreateModal = () => {
    setFormName('');
    setFormDescription('');
    setFormPincodes('');
    setFormError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (zone) => {
    setSelectedZone(zone);
    setFormName(zone.name);
    setFormDescription(zone.description || '');
    setFormPincodes(zone.pincodes ? zone.pincodes.join(', ') : '');
    setFormError(null);
    setShowEditModal(true);
  };

  const handleCreateZone = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formPincodes.trim()) {
      setFormError('Zone name and pincodes list are required.');
      return;
    }

    const pincodeArray = formPincodes
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (pincodeArray.length === 0) {
      setFormError('Please enter at least one valid pincode.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_URL}/orders/zones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          pincodes: pincodeArray
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Zone "${formName}" created successfully.`);
        setShowCreateModal(false);
        fetchZones();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setFormError(data.message || 'Failed to create zone.');
      }
    } catch (err) {
      setFormError('Network error. Failed to reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateZone = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formPincodes.trim()) {
      setFormError('Zone name and pincodes list are required.');
      return;
    }

    const pincodeArray = formPincodes
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (pincodeArray.length === 0) {
      setFormError('Please enter at least one valid pincode.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_URL}/orders/zones/${selectedZone._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          pincodes: pincodeArray
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Zone "${formName}" updated successfully.`);
        setShowEditModal(false);
        fetchZones();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setFormError(data.message || 'Failed to update zone.');
      }
    } catch (err) {
      setFormError('Network error. Failed to reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteZone = async (zone) => {
    if (!window.confirm(`Are you sure you want to delete zone "${zone.name}"?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_URL}/orders/zones/${zone._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Zone "${zone.name}" deleted successfully.`);
        fetchZones();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(data.message || 'Failed to delete zone.');
      }
    } catch (err) {
      setError('Network error. Failed to delete zone.');
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Configured Delivery Zones</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={openCreateModal} style={{ padding: '8px 12px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
              <Plus size={14} /> Create New Zone
            </button>
            <button className="btn btn-secondary" onClick={fetchZones} style={{ padding: '8px 12px' }}>
              <RefreshCw size={14} /> Refresh List
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ margin: '16px 24px 0 24px' }}>
            <Info size={18} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success" style={{ margin: '16px 24px 0 24px' }}>
            <Info size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="table-container">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading pincode zones metadata...
            </div>
          ) : zones.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No delivery zones configured in the database.
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Zone Name</th>
                  <th>Description</th>
                  <th>Total Pincodes</th>
                  <th>Covered Pincodes Catalog</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z._id}>
                    <td style={{ color: '#fff', fontWeight: '600' }}>{z.name}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '150px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {z.description || '-'}
                    </td>
                    <td>{z.pincodes?.length || 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '400px' }}>
                        {z.pincodes?.map(p => (
                          <span key={p} style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => openEditModal(z)} style={{ padding: '6px 10px', fontSize: '13px' }}>
                          <Edit size={12} /> Edit
                        </button>
                        <button className="btn btn-secondary" onClick={() => handleDeleteZone(z)} style={{ padding: '6px 10px', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Zone Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', color: '#fff' }}>Create New Zone</h3>
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            
            <form onSubmit={handleCreateZone}>
              {formError && (
                <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                  <Info size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Zone Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Zone Mumbai"
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Western Line and suburbs"
                  value={formDescription} 
                  onChange={(e) => setFormDescription(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Supported Pincodes (Comma separated)</label>
                <textarea 
                  className="form-input" 
                  rows={4}
                  placeholder="e.g. 400001, 400002, 400003"
                  value={formPincodes} 
                  onChange={(e) => setFormPincodes(e.target.value)} 
                  style={{ resize: 'vertical' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Provide unique numeric pincodes separated by commas.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Zone Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', color: '#fff' }}>Edit Zone: {selectedZone?.name}</h3>
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            
            <form onSubmit={handleUpdateZone}>
              {formError && (
                <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                  <Info size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Zone Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formDescription} 
                  onChange={(e) => setFormDescription(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Supported Pincodes (Comma separated)</label>
                <textarea 
                  className="form-input" 
                  rows={4}
                  value={formPincodes} 
                  onChange={(e) => setFormPincodes(e.target.value)} 
                  style={{ resize: 'vertical' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Modify pincodes. Removing pincodes linked to active orders will be rejected by the server.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminZones;
