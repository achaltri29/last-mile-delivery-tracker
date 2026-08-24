import React, { useContext, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { 
  Package, 
  Truck, 
  ShieldAlert, 
  LogOut, 
  Menu, 
  X, 
  LayoutDashboard, 
  MapPin, 
  CreditCard 
} from 'lucide-react';

const SharedLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getLinks = () => {
    if (!user) return [];
    if (user.role === 'admin') {
      return [
        { label: 'Admin Panel', path: '/admin', icon: <LayoutDashboard size={20} /> },
        { label: 'Zone Setup', path: '/admin/zones', icon: <MapPin size={20} /> },
        { label: 'Rate Cards', path: '/admin/rates', icon: <CreditCard size={20} /> }
      ];
    }
    if (user.role === 'agent') {
      return [
        { label: 'Agent Console', path: '/agent', icon: <Truck size={20} /> }
      ];
    }
    return [
      { label: 'Customer Area', path: '/customer', icon: <Package size={20} /> }
    ];
  };

  const links = getLinks();

  return (
    <div className="layout-container">
      {/* Sidebar navigation drawer */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span>LastMile</span> Tracker
        </div>

        <nav className="sidebar-menu">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="user-avatar">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.name || 'User Profile'}</span>
              <span className="user-role">{user?.role || 'Guest'}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%', gap: '8px' }}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        <header className="header">
          <button className="mobile-nav-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          <div className="page-title">
            Last-Mile Delivery Portal
          </div>
          
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
            Zone: <span style={{ color: 'var(--accent)' }}>DEL-NCR</span>
          </div>
        </header>

        <main className="content-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SharedLayout;
