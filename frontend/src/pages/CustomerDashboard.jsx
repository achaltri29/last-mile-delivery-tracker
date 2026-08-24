import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  Package, 
  MapPin, 
  Layers, 
  Clock, 
  TrendingUp, 
  Calendar, 
  Info, 
  Plus, 
  DollarSign, 
  Calculator,
  RefreshCw
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CustomerDashboard = () => {
  const { token, user } = useContext(AuthContext);

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  
  // Create Order state
  const [pickupPincode, setPickupPincode] = useState('');
  const [pickupStreet, setPickupStreet] = useState('');
  const [pickupArea, setPickupArea] = useState('');
  const [pickupCity, setPickupCity] = useState('');
  const [pickupState, setPickupState] = useState('');

  const [dropPincode, setDropPincode] = useState('');
  const [dropStreet, setDropStreet] = useState('');
  const [dropArea, setDropArea] = useState('');
  const [dropCity, setDropCity] = useState('');
  const [dropState, setDropState] = useState('');

  const [length, setLength] = useState('10');
  const [breadth, setBreadth] = useState('10');
  const [height, setHeight] = useState('10');
  const [actualWeight, setActualWeight] = useState('1');
  const [orderType, setOrderType] = useState('B2B');
  const [paymentType, setPaymentType] = useState('Prepaid');

  // Pricing preview states
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  // General state
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Rescheduling states
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  // Fetch orders
  const fetchOrders = async () => {
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
      setError('Failed to load orders.');
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Fetch order details for timeline
  const selectOrder = async (order) => {
    setSelectedOrder(order);
    setRescheduleError(null);
    setRescheduleDate('');
    try {
      const res = await fetch(`${API_URL}/orders/${order._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        // Timeline comes from the populated order history in backend
        setTimeline(data.data.timeline || []);
        setSelectedOrder(data.data.order);
      }
    } catch (e) {
      console.error('Timeline fetch error:', e.message);
    }
  };

  // Live rate calculation trigger on input change
  useEffect(() => {
    const calculatePreview = async () => {
      if (!pickupPincode || !dropPincode || !length || !breadth || !height || !actualWeight) {
        setPreview(null);
        return;
      }
      setPreviewError(null);
      try {
        const res = await fetch(`${API_URL}/orders/calculate-rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupAddress: { pincode: pickupPincode },
            dropAddress: { pincode: dropPincode },
            dimensions: { 
              length: parseFloat(length), 
              breadth: parseFloat(breadth), 
              height: parseFloat(height) 
            },
            actualWeight: parseFloat(actualWeight),
            orderType,
            paymentType
          })
        });
        const data = await res.json();
        if (data.success) {
          setPreview(data.data);
        } else {
          setPreviewError(data.message);
          setPreview(null);
        }
      } catch (e) {
        setPreviewError('Failed to fetch pricing preview');
        setPreview(null);
      }
    };

    const debounce = setTimeout(calculatePreview, 400);
    return () => clearTimeout(debounce);
  }, [pickupPincode, dropPincode, length, breadth, height, actualWeight, orderType, paymentType]);

  // Place order
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!pickupPincode || !dropPincode || !pickupStreet || !dropStreet || !pickupArea || !dropArea || !pickupCity || !dropCity || !pickupState || !dropState) {
      setError('Please fill in complete addresses and details.');
      return;
    }
    setError(null);
    setSuccess(null);
    setPlacingOrder(true);

    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pickupAddress: {
            streetAddress: pickupStreet,
            area: pickupArea,
            city: pickupCity,
            state: pickupState,
            pincode: pickupPincode
          },
          dropAddress: {
            streetAddress: dropStreet,
            area: dropArea,
            city: dropCity,
            state: dropState,
            pincode: dropPincode
          },
          dimensions: {
            length: parseFloat(length),
            breadth: parseFloat(breadth),
            height: parseFloat(height)
          },
          actualWeight: parseFloat(actualWeight),
          orderType,
          paymentType
        })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Order placed successfully! Number: ${data.data.orderNumber}`);
        // Reset inputs
        setPickupPincode('');
        setPickupStreet('');
        setPickupArea('');
        setPickupCity('');
        setPickupState('');
        setDropPincode('');
        setDropStreet('');
        setDropArea('');
        setDropCity('');
        setDropState('');
        fetchOrders();
      } else {
        setError(data.message || 'Failed to place order.');
      }
    } catch (e) {
      setError('Connection failure while placing order.');
    } finally {
      setPlacingOrder(false);
    }
  };

  // Reschedule failed order
  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!rescheduleDate) {
      setRescheduleError('Please choose a date.');
      return;
    }
    setRescheduling(true);
    setRescheduleError(null);

    try {
      const res = await fetch(`${API_URL}/orders/${selectedOrder._id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rescheduledDate: rescheduleDate })
      });
      const data = await res.json();

      if (data.success) {
        setSelectedOrder(data.data);
        // Refresh orders list
        fetchOrders();
        setRescheduleDate('');
      } else {
        setRescheduleError(data.message || 'Failed to reschedule.');
      }
    } catch (err) {
      setRescheduleError('Server communication error.');
    } finally {
      setRescheduling(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    const formatted = status ? status.toLowerCase() : 'pending';
    return `badge badge-${formatted}`;
  };

  return (
    <div>
      {/* Top statistics banners */}
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Package size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{orders.length}</span>
            <span className="stat-label">Total Shipments</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => o.status === 'Delivered').length}
            </span>
            <span className="stat-label">Successfully Delivered</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)' }}>
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Out for Delivery'].includes(o.status)).length}
            </span>
            <span className="stat-label">Active Shipments</span>
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

      {/* Place Shipments Form */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Book New Last-Mile Dispatch</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pincode-based Auto routing enabled</span>
        </div>

        <form onSubmit={handleCreateOrder}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '24px' }}>
            
            {/* Pickup address section */}
            <div>
              <h4 style={{ color: 'var(--accent)', marginBottom: '16px', fontSize: '15px', fontWeight: '600', textTransform: 'uppercase' }}>
                Pickup Location Details
              </h4>
              <div className="form-group">
                <label className="form-label">Street / Office Address</label>
                <input
                  type="text"
                  className="form-input"
                  value={pickupStreet}
                  onChange={(e) => setPickupStreet(e.target.value)}
                  placeholder="G-12, Outer Circle, Connaught Place"
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Area</label>
                  <input
                    type="text"
                    className="form-input"
                    value={pickupArea}
                    onChange={(e) => setPickupArea(e.target.value)}
                    placeholder="Connaught Place"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-input"
                    value={pickupCity}
                    onChange={(e) => setPickupCity(e.target.value)}
                    placeholder="New Delhi"
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="form-input"
                    value={pickupState}
                    onChange={(e) => setPickupState(e.target.value)}
                    placeholder="Delhi"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    className="form-input"
                    value={pickupPincode}
                    onChange={(e) => setPickupPincode(e.target.value)}
                    placeholder="110001"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Drop address section */}
            <div>
              <h4 style={{ color: 'var(--accent)', marginBottom: '16px', fontSize: '15px', fontWeight: '600', textTransform: 'uppercase' }}>
                Recipient Drop Details
              </h4>
              <div className="form-group">
                <label className="form-label">Street Address</label>
                <input
                  type="text"
                  className="form-input"
                  value={dropStreet}
                  onChange={(e) => setDropStreet(e.target.value)}
                  placeholder="A-4, Sector 7, Rohini"
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Area</label>
                  <input
                    type="text"
                    className="form-input"
                    value={dropArea}
                    onChange={(e) => setDropArea(e.target.value)}
                    placeholder="Rohini"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-input"
                    value={dropCity}
                    onChange={(e) => setDropCity(e.target.value)}
                    placeholder="Delhi"
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="form-input"
                    value={dropState}
                    onChange={(e) => setDropState(e.target.value)}
                    placeholder="Delhi"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    className="form-input"
                    value={dropPincode}
                    onChange={(e) => setDropPincode(e.target.value)}
                    placeholder="110002"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dimension Details & Calculator layout */}
          <h4 style={{ color: 'var(--accent)', marginBottom: '16px', fontSize: '15px', fontWeight: '600', textTransform: 'uppercase' }}>
            Package & Weight details
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '20px', alignItems: 'end', marginBottom: '32px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Dimensions (L × B × H) cm</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="number" className="form-input" value={length} onChange={(e) => setLength(e.target.value)} placeholder="L" style={{ padding: '12px 8px', textAlign: 'center' }} />
                <input type="number" className="form-input" value={breadth} onChange={(e) => setBreadth(e.target.value)} placeholder="B" style={{ padding: '12px 8px', textAlign: 'center' }} />
                <input type="number" className="form-input" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="H" style={{ padding: '12px 8px', textAlign: 'center' }} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Actual Weight (Kg)</label>
              <input type="number" className="form-input" value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} placeholder="Weight" required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment</label>
                <select className="form-select" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                  <option value="Prepaid">Prepaid</option>
                  <option value="COD">COD (Surcharged)</option>
                </select>
              </div>
            </div>

            {/* Live Preview Panel */}
            <div style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '68px' }}>
              <Calculator size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                {preview ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '13px' }}>
                    <div>Zone: <strong style={{ color: '#fff' }}>{preview.zoneType}</strong></div>
                    <div>Billable: <strong style={{ color: '#fff' }}>{preview.billableWeight} kg</strong></div>
                    <div style={{ gridColumn: 'span 2', fontSize: '15px' }}>
                      Price: <strong style={{ color: 'var(--success)', fontSize: '18px' }}>₹{preview.deliveryCharge}</strong>
                    </div>
                  </div>
                ) : previewError ? (
                  <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{previewError}</span>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Enter pincodes to see weight and price previews.</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={placingOrder}
          >
            {placingOrder ? 'Processing dispatch order...' : 'Confirm Book Dispatch'}
          </button>
        </form>
      </div>

      {/* Orders List */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Past Bookings</h3>
          <button className="btn btn-secondary" onClick={fetchOrders} style={{ padding: '8px 12px' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="table-container">
          {loadingOrders ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading shipments catalog...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No shipments found. Book your first delivery above.
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Order Number</th>
                  <th>Recipient Address</th>
                  <th>Charge</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{o._id.substring(18)}</td>
                    <td style={{ color: '#fff', fontWeight: '500' }}>{o.orderNumber}</td>
                    <td>{`${o.dropAddress.area}, ${o.dropAddress.city} (${o.dropAddress.pincode})`}</td>
                    <td style={{ color: 'var(--success)' }}>₹{o.deliveryCharge}</td>
                    <td>
                      <span className={getStatusBadgeClass(o.status)}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => selectOrder(o)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                        Track details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Details & Timeline Modal Drawer */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px' }}>Shipment Details: {selectedOrder.orderNumber}</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)} style={{ padding: '4px 8px' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', fontSize: '14px', background: 'rgba(30, 41, 59, 0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div>Pickup Pincode: <strong>{selectedOrder.pickupAddress?.pincode}</strong></div>
              <div>Drop Pincode: <strong>{selectedOrder.dropAddress?.pincode}</strong></div>
              <div>Billable Weight: <strong>{selectedOrder.billableWeight} kg</strong></div>
              <div>Charge: <strong style={{ color: 'var(--success)' }}>₹{selectedOrder.deliveryCharge}</strong></div>
              <div>Status: <span className={getStatusBadgeClass(selectedOrder.status)}>{selectedOrder.status}</span></div>
              <div>Agent Assigned: <strong>{selectedOrder.deliveryAgent ? selectedOrder.deliveryAgent.name : 'Unassigned'}</strong></div>
            </div>

            {/* Rescheduling Form container for Failed Orders */}
            {selectedOrder.status === 'Failed' && (
              <div style={{ border: '1px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
                <h4 style={{ color: 'var(--warning)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  Delivery Attempt Failed
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Remarks: {selectedOrder.attempts[selectedOrder.attempts.length - 1]?.failureRemarks || 'No remarks provided'}
                </p>

                {rescheduleError && (
                  <div className="alert alert-danger" style={{ padding: '8px', fontSize: '12px', marginBottom: '12px' }}>
                    {rescheduleError}
                  </div>
                )}

                <form onSubmit={handleReschedule} style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="date"
                      className="form-input"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '10px 16px' }} disabled={rescheduling}>
                    {rescheduling ? 'Rescheduling...' : 'Reschedule Shipment'}
                  </button>
                </form>
              </div>
            )}

            {/* Tracking History timeline */}
            <h4 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px' }}>Tracking History</h4>
            <div style={{ maxHeight: '240px', overflowY: 'auto', paddingRight: '8px' }}>
              {timeline.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No logs compiled.</div>
              ) : (
                <div className="timeline">
                  {timeline.map((t, idx) => (
                    <div className="timeline-item" key={t._id || idx}>
                      <div className={`timeline-dot ${idx === 0 ? 'active' : ''}`} />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-status">{t.newStatus}</span>
                          <span className="timeline-time">{new Date(t.timestamp).toLocaleString()}</span>
                        </div>
                        {t.remarks && <div className="timeline-remarks">Remarks: {t.remarks}</div>}
                        <div className="timeline-actor">Actor: {t.actor?.name || 'System'} ({t.actor?.role || 'system'})</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;
