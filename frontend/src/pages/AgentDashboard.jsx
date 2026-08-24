import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  Truck, 
  MapPin, 
  User, 
  Info, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Phone
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AgentDashboard = () => {
  const { token, user } = useContext(AuthContext);

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const [remarks, setRemarks] = useState('');
  const [showFailModal, setShowFailModal] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchAssignedOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError('Failed to fetch assigned shipments.');
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchAssignedOrders();
  }, []);

  const handleStatusChange = async (orderId, targetStatus, statusRemarks = '') => {
    setError(null);
    setSuccess(null);
    setUpdatingStatus(true);

    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: targetStatus, remarks: statusRemarks })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Shipment status updated to ${targetStatus}`);
        // If the selected order is open, update its local profile
        if (selectedOrder && selectedOrder._id === orderId) {
          setSelectedOrder(data.data);
        }
        fetchAssignedOrders();
        setShowFailModal(false);
        setRemarks('');
      } else {
        setError(data.message || 'Status transition rejected.');
      }
    } catch (e) {
      setError('Connection error while updating status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    const formatted = status ? status.toLowerCase() : 'pending';
    return `badge badge-${formatted}`;
  };

  return (
    <div>
      {/* Metrics Banner */}
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Truck size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => ['Assigned', 'Picked Up', 'In Transit', 'Out for Delivery'].includes(o.status)).length}
            </span>
            <span className="stat-label">Assigned Workload</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' }}>
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => o.status === 'Delivered').length}
            </span>
            <span className="stat-label">Total Delivered</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)' }}>
            <XCircle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => o.status === 'Failed').length}
            </span>
            <span className="stat-label">Failed Deliveries</span>
          </div>
        </div>
      </div>

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '24px' }}>
          <Info size={18} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '24px' }}>
          <Info size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Orders List Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Assigned Shipment Dispatches</h3>
          <button className="btn btn-secondary" onClick={fetchAssignedOrders} style={{ padding: '8px 12px' }}>
            <RefreshCw size={14} /> Refresh List
          </button>
        </div>

        <div className="table-container">
          {loadingOrders ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading assigned runs...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No shipments currently assigned to you.
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Pickup Locality</th>
                  <th>Drop Locality</th>
                  <th>Order Type</th>
                  <th>Payment Mode</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td style={{ color: '#fff', fontWeight: '500' }}>{o.orderNumber}</td>
                    <td>{`${o.pickupAddress.area} (${o.pickupAddress.pincode})`}</td>
                    <td>{`${o.dropAddress.area} (${o.dropAddress.pincode})`}</td>
                    <td>{o.orderType}</td>
                    <td style={{ color: o.paymentType === 'COD' ? 'var(--warning)' : 'var(--text-secondary)' }}>{o.paymentType}</td>
                    <td>
                      <span className={getStatusBadgeClass(o.status)}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setSelectedOrder(o)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                        View Console
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Order Details & Execution Console */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px' }}>Shipment Console: {selectedOrder.orderNumber}</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)} style={{ padding: '4px 8px' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              
              {/* Address details */}
              <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '14px' }}>
                <h4 style={{ color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Pickup details</h4>
                <p style={{ color: '#fff', marginBottom: '4px' }}>{selectedOrder.pickupAddress?.streetAddress}</p>
                <p>{selectedOrder.pickupAddress?.area}, {selectedOrder.pickupAddress?.city}</p>
                <p>Pincode: <strong>{selectedOrder.pickupAddress?.pincode}</strong></p>
              </div>

              <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '14px' }}>
                <h4 style={{ color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Drop details</h4>
                <p style={{ color: '#fff', marginBottom: '4px' }}>{selectedOrder.dropAddress?.streetAddress}</p>
                <p>{selectedOrder.dropAddress?.area}, {selectedOrder.dropAddress?.city}</p>
                <p>Pincode: <strong>{selectedOrder.dropAddress?.pincode}</strong></p>
              </div>

              {/* Customer details */}
              <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '14px', gridColumn: 'span 2' }}>
                <h4 style={{ color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Customer Contact</h4>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={16} />
                    <span>{selectedOrder.customer?.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={16} />
                    <span>{selectedOrder.customer?.phone}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Buttons depending on State */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', textAlign: 'center' }}>
              <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Order Lifecycle Controls (Current: <span style={{ color: 'var(--accent)' }}>{selectedOrder.status}</span>)
              </h4>

              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                {selectedOrder.status === 'Assigned' && (
                  <button
                    onClick={() => handleStatusChange(selectedOrder._id, 'Picked Up')}
                    className="btn btn-primary"
                    style={{ width: '200px' }}
                    disabled={updatingStatus}
                  >
                    Mark Picked Up
                  </button>
                )}

                {selectedOrder.status === 'Picked Up' && (
                  <button
                    onClick={() => handleStatusChange(selectedOrder._id, 'In Transit')}
                    className="btn btn-primary"
                    style={{ width: '200px' }}
                    disabled={updatingStatus}
                  >
                    Mark In Transit
                  </button>
                )}

                {selectedOrder.status === 'In Transit' && (
                  <button
                    onClick={() => handleStatusChange(selectedOrder._id, 'Out for Delivery')}
                    className="btn btn-primary"
                    style={{ width: '200px' }}
                    disabled={updatingStatus}
                  >
                    Mark Out for Delivery
                  </button>
                )}

                {selectedOrder.status === 'Out for Delivery' && (
                  <>
                    <button
                      onClick={() => handleStatusChange(selectedOrder._id, 'Delivered')}
                      className="btn btn-primary"
                      style={{ background: 'var(--success)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}
                      disabled={updatingStatus}
                    >
                      Complete Delivery
                    </button>
                    <button
                      onClick={() => setShowFailModal(true)}
                      className="btn btn-danger"
                      disabled={updatingStatus}
                    >
                      Report Failed
                    </button>
                  </>
                )}

                {['Delivered', 'Failed'].includes(selectedOrder.status) && (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    This order has reached a terminal execution state.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failure Remarks Input Drawer Modal */}
      {showFailModal && (
        <div className="modal-overlay" onClick={() => setShowFailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <h3 style={{ marginBottom: '16px' }}>Report Failed Delivery</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Provide the reason for the failed delivery attempt (e.g. Customer Unavailable, Address Incorrect, etc).
            </p>
            <div className="form-group">
              <label className="form-label">Failure Remarks</label>
              <textarea
                className="form-input"
                style={{ minHeight: '100px', resize: 'vertical' }}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Remarks details..."
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setShowFailModal(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => handleStatusChange(selectedOrder._id, 'Failed', remarks)}
                disabled={!remarks || updatingStatus}
              >
                Confirm Fail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;
