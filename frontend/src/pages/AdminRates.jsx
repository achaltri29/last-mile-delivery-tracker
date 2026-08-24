import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { CreditCard, Info, RefreshCw, Edit } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminRates = () => {
  const { token } = useContext(AuthContext);

  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Edit Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);

  // Form Fields
  const [formBaseWeight, setFormBaseWeight] = useState('');
  const [formBaseRate, setFormBaseRate] = useState('');
  const [formPerKgRate, setFormPerKgRate] = useState('');
  const [formCodSurcharge, setFormCodSurcharge] = useState('');
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orders/metadata/rates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setRates(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Connection failure: rate cards could not be retrieved.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const openEditModal = (rate) => {
    setSelectedRate(rate);
    setFormBaseWeight(rate.baseWeight.toString());
    setFormBaseRate(rate.baseRate.toString());
    setFormPerKgRate(rate.perKgRate.toString());
    setFormCodSurcharge(rate.codSurcharge.toString());
    setFormError(null);
    setShowEditModal(true);
  };

  const handleUpdateRates = async (e) => {
    e.preventDefault();

    const weight = parseFloat(formBaseWeight);
    const base = parseFloat(formBaseRate);
    const perKg = parseFloat(formPerKgRate);
    const cod = parseFloat(formCodSurcharge);

    if (isNaN(weight) || weight < 0) {
      setFormError('Base weight must be a valid non-negative number.');
      return;
    }
    if (isNaN(base) || base < 0) {
      setFormError('Base rate must be a valid non-negative number.');
      return;
    }
    if (isNaN(perKg) || perKg < 0) {
      setFormError('Incremental per-kg rate must be a valid non-negative number.');
      return;
    }
    if (isNaN(cod) || cod < 0) {
      setFormError('COD surcharge must be a valid non-negative number.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_URL}/orders/rates/${selectedRate._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          baseWeight: weight,
          baseRate: base,
          perKgRate: perKg,
          codSurcharge: cod
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Rate card for ${selectedRate.orderType} (${selectedRate.zoneType}) updated successfully.`);
        setShowEditModal(false);
        fetchRates();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setFormError(data.message || 'Failed to update rate card parameters.');
      }
    } catch (err) {
      setFormError('Network error. Failed to reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Configured Pricing Rate Cards</h3>
          <button className="btn btn-secondary" onClick={fetchRates} style={{ padding: '8px 12px' }}>
            <RefreshCw size={14} /> Refresh List
          </button>
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
              Loading pricing structures metadata...
            </div>
          ) : rates.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No rate cards configured in the database.
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Order Type</th>
                  <th>Zone Relation Type</th>
                  <th>Base Weight Limit</th>
                  <th>Base Shipping Charge</th>
                  <th>Incremental per-Kg Charge</th>
                  <th>COD Surcharge Fee</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r._id}>
                    <td style={{ color: '#fff', fontWeight: '600' }}>{r.orderType}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: '500' }}>{r.zoneType}</td>
                    <td>{r.baseWeight} kg</td>
                    <td style={{ color: '#fff' }}>₹{r.baseRate}</td>
                    <td>₹{r.perKgRate} / kg</td>
                    <td style={{ color: 'var(--warning)' }}>₹{r.codSurcharge}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary" onClick={() => openEditModal(r)} style={{ padding: '6px 10px', fontSize: '13px' }}>
                        <Edit size={12} /> Edit Rates
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Rate Card Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', color: '#fff' }}>
                Edit Rate Parameters: {selectedRate?.orderType} ({selectedRate?.zoneType})
              </h3>
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>

            <form onSubmit={handleUpdateRates}>
              {formError && (
                <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                  <Info size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Base Weight Limit (kg)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  value={formBaseWeight} 
                  onChange={(e) => setFormBaseWeight(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Base Shipping Charge (₹)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  value={formBaseRate} 
                  onChange={(e) => setFormBaseRate(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Incremental per-Kg Charge (₹)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  value={formPerKgRate} 
                  onChange={(e) => setFormPerKgRate(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">COD Surcharge Fee (₹)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  value={formCodSurcharge} 
                  onChange={(e) => setFormCodSurcharge(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Parameters'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRates;
