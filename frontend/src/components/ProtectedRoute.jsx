import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, token, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F19' }}>
        <div style={{ color: '#94A3B8', fontSize: '18px', fontWeight: '500' }}>Loading user session...</div>
      </div>
    );
  }

  if (!token || !user) {
    // Redirect to login page but save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Role unauthorized, redirect to standard dashboard depending on user role
    const defaultRoute = 
      user.role === 'admin' ? '/admin' :
      user.role === 'agent' ? '/agent' : '/customer';
    return <Navigate to={defaultRoute} replace />;
  }

  return children;
};

export default ProtectedRoute;
