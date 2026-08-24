import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  ShieldAlert, 
  MapPin, 
  User, 
  Info, 
  UserCheck, 
  RefreshCw,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminDashboard = () => {
  const { token } = useContext(AuthContext);

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [agents, setAgents] = useState([]);
  
  // Filtering states
  const [statusFilter, setStatusFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  // Dropdown lists
  const [zonesList, setZonesList] = useState([]);
  const [agentsList, setAgentsList] = useState([]);

  // Assignment states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assignError, setAssignError] = useState(null);
  const [assigning, setAssigning] = useState(false);

  // Status override states
  const [overrideStatus, setOverrideStatus] = useState('');
  const [overrideRemarks, setOverrideRemarks] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState(null);

  // General states
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Fetch all orders
  const fetchAllOrders = async () => {
    setLoadingOrders(true);
    try {
      // Build query string
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (zoneFilter) params.append('zone', zoneFilter);
      if (agentFilter) params.append('agent', agentFilter);

      const res = await fetch(`${API_URL}/orders?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError('Connection failed: orders could not be fetched.');
    } finally {
      setLoadingOrders(false);
    }
  };

  // Fetch zones, agents list for filters and dropdowns
  const fetchMetadata = async () => {
    try {
      // 1. Fetch zones
      const zonesRes = await fetch(`${API_URL}/orders/calculate-rate`, {
        // Just dummy hit or check zones from DB if possible.
        // Since there is no listZones API, we can fetch all zones or hardcode Delhi/NCR.
        // Wait! We can retrieve configured zones if we hit a fetch mock. Let's mock a query or retrieve from orders.
      });
      
      // Let's query users with role=agent to populate the agents list
      const usersRes = await fetch(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ordersData = await usersRes.json();
      if (ordersData.success) {
        // Dynamically find distinct agents and zones from the order details
        const uniqueAgents = {};
        const uniqueZones = {};
        ordersData.data.forEach(o => {
          if (o.deliveryAgent) {
            uniqueAgents[o.deliveryAgent._id] = o.deliveryAgent.name;
          }
          if (o.pickupZone) {
            uniqueZones[o.pickupZone._id] = o.pickupZone.name;
          }
        });
        setAgentsList(Object.entries(uniqueAgents).map(([id, name]) => ({ _id: id, name })));
        setZonesList(Object.entries(uniqueZones).map(([id, name]) => ({ _id: id, name })));
      }
    } catch (e) {
      console.error('Metadata fetch error:', e.message);
    }
  };

  useEffect(() => {
    fetchAllOrders();
    fetchMetadata();
  }, [statusFilter, zoneFilter, agentFilter]);

  // Fetch agents available for assignment for the selected order
  const openAssignModal = async (order) => {
    setSelectedOrder(order);
    setSelectedAgentId('');
    setAssignError(null);
    setShowAssignModal(true);

    try {
      // Fetch all delivery agents to display
      // We will perform a simple user fetch by calling backend API or filtering out
      const res = await fetch(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        // Collect distinct agents who are available or matching
        // In backend: assignment selects agents with role: 'agent'
        // For demonstration, let's fetch all agents from metadata.
        // We will fetch users from backend. Wait, is there a user listing endpoint?
        // Let's check: there is no GET /api/users endpoint.
        // But we can fetch active agents dynamically or define a fallback list of agents!
        // Wait, is there a list of agents in the database? Yes.
        // If we don't have a user listing endpoint, let's look at authController or create one? No, we shouldn't modify backend business logic unless it is a genuine blocker.
        // Wait! In Phase 4 manual assignment endpoint:
        // `POST /api/orders/:id/assign` requires an `agentId` body.
        // To assign, the admin must select an agent. How does the admin see the list of agents?
        // We can dynamically scan for agents from all orders, OR we can query agents.
        // Wait! Let's check `backend/src/app.js` and see if there are other routes.
        // No, only `authRoutes.js` and `orderRoutes.js`.
        // Wait! How do we get the list of all delivery agents in the system?
        // In the backend, we can expose a small endpoint `GET /api/orders/agents` or fetch all users in the system.
        // Wait, does an endpoint like `GET /api/orders` return all orders, which contain the deliveryAgent details? Yes!
        // We can scan all orders, compile the list of agents, and display them.
        // Also, we can register/login agents. If we register multiple agents, their IDs will be known.
        // Let's also see if we can query them. In `orderController.js`, does it query agents?
        // Yes, in `AutoAssignmentService`, it queries `User.find({ role: 'agent' })`.
        // If the frontend needs to list agents, we can add a small endpoint `GET /api/orders/agents` in `orderRoutes.js` and `orderController.js`!
        // Wait! Is it a genuine blocker? Yes, without it, the admin cannot dynamically discover agents who have not yet received any orders (since they won't appear in the orders scan).
        // Let's add a small helper endpoint `GET /api/orders/agents` to retrieve all delivery agents! It is extremely safe, standard, and won't conflict.
        // Let's do that! That is a very clean frontend integration enhancement.
      }
    } catch (e) {
      console.error(e);
    }
  };

  // We can fetch agents from `GET /api/orders/agents` which we will add.
  const loadAgents = async () => {
    try {
      const res = await fetch(`${API_URL}/orders/agents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAgents(data.data);
      }
    } catch (e) {
      console.error('Failed to load agents list', e.message);
    }
  };

  useEffect(() => {
    if (showAssignModal) {
      loadAgents();
    }
  }, [showAssignModal]);

  // Execute manual agent assignment
  const handleAssignAgent = async (e) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setAssignError('Please select a delivery agent.');
      return;
    }
    setAssigning(true);
    setAssignError(null);

    try {
      const res = await fetch(`${API_URL}/orders/${selectedOrder._id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ agentId: selectedAgentId })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Shipment successfully assigned to agent!`);
        setShowAssignModal(false);
        setSelectedOrder(null);
        fetchAllOrders();
      } else {
        setAssignError(data.message || 'Assignment failed.');
      }
    } catch (e) {
      setAssignError('Connection failure during manual assignment.');
    } finally {
      setAssigning(false);
    }
  };

  // Execute admin status override
  const handleStatusOverride = async (e) => {
    e.preventDefault();
    if (!overrideStatus) {
      setOverrideError('Please choose a target status.');
      return;
    }
    setOverriding(true);
    setOverrideError(null);

    try {
      const res = await fetch(`${API_URL}/orders/${selectedOrder._id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: overrideStatus, remarks: overrideRemarks || 'Admin status override' })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Status overridden to: ${overrideStatus}`);
        setSelectedOrder(data.data);
        fetchAllOrders();
        setOverrideStatus('');
        setOverrideRemarks('');
      } else {
        setOverrideError(data.message || 'Status transition rejected.');
      }
    } catch (e) {
      setOverrideError('Connection failure.');
    } finally {
      setOverriding(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    const formatted = status ? status.toLowerCase() : 'pending';
    return `badge badge-${formatted}`;
  };

  return (
    <div>
      {/* Top metrics grids */}
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <SlidersHorizontal size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{orders.length}</span>
            <span className="stat-label">Matching Orders</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)' }}>
            <SlidersHorizontal size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => o.status === 'Pending Assignment').length}
            </span>
            <span className="stat-label">Pending Assignment</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: 'var(--accent)' }}>
            <SlidersHorizontal size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {orders.filter(o => o.status === 'Rescheduled').length}
            </span>
            <span className="stat-label">Rescheduled Shipments</span>
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

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '16px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>Filters:</span>
          
          <div style={{ minWidth: '160px' }}>
            <select className="form-select" style={{ padding: '8px 12px', fontSize: '13px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Pending Assignment">Pending Assignment</option>
              <option value="Assigned">Assigned</option>
              <option value="Picked Up">Picked Up</option>
              <option value="In Transit">In Transit</option>
              <option value="Out for Delivery">Out for Delivery</option>
              <option value="Delivered">Delivered</option>
              <option value="Failed">Failed</option>
              <option value="Rescheduled">Rescheduled</option>
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select className="form-select" style={{ padding: '8px 12px', fontSize: '13px' }} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
              <option value="">All Zones</option>
              {zonesList.map(z => <option key={z._id} value={z._id}>{z.name}</option>)}
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select className="form-select" style={{ padding: '8px 12px', fontSize: '13px' }} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">All Agents</option>
              {agentsList.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>

          <button className="btn btn-secondary" onClick={() => { setStatusFilter(''); setZoneFilter(''); setAgentFilter(''); }} style={{ padding: '8px 12px', fontSize: '13px' }}>
            Clear Filters
          </button>

          <button className="btn btn-secondary" onClick={fetchAllOrders} style={{ padding: '8px 12px', fontSize: '13px', marginLeft: 'auto' }}>
            <RefreshCw size={14} /> Refresh List
          </button>
        </div>
      </div>

      {/* Orders Monitor List */}
      <div className="card">
        <div className="table-container">
          {loadingOrders ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading dispatches records...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No orders matched the selected filters.
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Pickup Zone</th>
                  <th>Drop Pincode</th>
                  <th>Agent Assigned</th>
                  <th>Active Workload</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td style={{ color: '#fff', fontWeight: '600' }}>{o.orderNumber}</td>
                    <td>{o.pickupZone?.name || 'Pending routing'}</td>
                    <td>{o.dropAddress?.pincode}</td>
                    <td>{o.deliveryAgent ? o.deliveryAgent.name : 'Unassigned'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {o.deliveryAgent?.agentMetadata?.activeOrderCount !== undefined 
                        ? o.deliveryAgent.agentMetadata.activeOrderCount 
                        : '-'}
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(o.status)}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => selectOrderProfile(o)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '13px' }}>
                        Override
                      </button>
                      <button onClick={() => openAssignModal(o)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '13px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                        Manual Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Select Order profile and history overrides */}
      {selectedOrder && !showAssignModal && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px' }}>Admin Override: {selectedOrder.orderNumber}</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)} style={{ padding: '4px 8px' }}>Close</button>
            </div>

            {/* Quick profile info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', fontSize: '14px', background: 'rgba(30, 41, 59, 0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div>Status: <span className={getStatusBadgeClass(selectedOrder.status)}>{selectedOrder.status}</span></div>
              <div>Current Agent: <strong>{selectedOrder.deliveryAgent ? selectedOrder.deliveryAgent.name : 'None'}</strong></div>
            </div>

            {/* Override status controls */}
            <form onSubmit={handleStatusOverride} style={{ border: '1px solid var(--border-color)', padding: '20px', borderRadius: '12px', background: 'rgba(30, 41, 59, 0.3)' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '16px', color: '#fff' }}>Change Status Pipeline State</h4>
              
              {overrideError && (
                <div className="alert alert-danger" style={{ padding: '8px', fontSize: '12px', marginBottom: '12px' }}>
                  {overrideError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Target Status</label>
                  <select className="form-select" value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
                    <option value="">Select state...</option>
                    <option value="Pending">Pending</option>
                    <option value="Pending Assignment">Pending Assignment</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Picked Up">Picked Up</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Out for Delivery">Out for Delivery</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Failed">Failed</option>
                    <option value="Rescheduled">Rescheduled</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Audit Log Remarks</label>
                  <input
                    type="text"
                    className="form-input"
                    value={overrideRemarks}
                    onChange={(e) => setOverrideRemarks(e.target.value)}
                    placeholder="Provide reason for override..."
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={overriding || !overrideStatus}>
                {overriding ? 'Updating pipeline...' : 'Execute Override'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manual Agent Assignment modal */}
      {showAssignModal && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px' }}>Manual Agent Assignment</h3>
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)} style={{ padding: '4px 8px' }}>Close</button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Manual dispatch override for order <strong>{selectedOrder.orderNumber}</strong>. Showing agents in pickup zone.
            </p>

            {assignError && (
              <div className="alert alert-danger" style={{ padding: '8px', fontSize: '12px', marginBottom: '12px' }}>
                {assignError}
              </div>
            )}

            <form onSubmit={handleAssignAgent}>
              <div className="form-group">
                <label className="form-label">Select Delivery Agent</label>
                <select className="form-select" value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} required>
                  <option value="">Choose agent...</option>
                  {agents.map(a => (
                    <option key={a._id} value={a._id}>
                      {`${a.name} (Active Orders: ${a.agentMetadata?.activeOrderCount || 0}) ${a.agentMetadata?.isAvailable ? '[Available]' : '[Unavailable]'}`}
                    </option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={assigning || !selectedAgentId}>
                {assigning ? 'Confirming assignment...' : 'Assign Agent'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  function selectOrderProfile(order) {
    setSelectedOrder(order);
  }
};

export default AdminDashboard;
