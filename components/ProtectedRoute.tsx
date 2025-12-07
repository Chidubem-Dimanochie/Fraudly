
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Optional role to check for authorization.
   * If not provided, the route only checks for authentication.
   */
  role?: UserRole;
}

/**
 * A component that protects routes from unauthorized access.
 * - Redirects to /login if the user is not authenticated.
 * - Redirects to /unauthorized if the user does not have the required role.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, role }) => {
  const { user } = useAuth();

  if (!user) {
    // User is not authenticated, redirect to the login page
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    // User is authenticated but does not have the required role, redirect to unauthorized page
    return <Navigate to="/unauthorized" replace />;
  }

  // User is authenticated and has the required role (if specified)
  return <>{children}</>;
};
