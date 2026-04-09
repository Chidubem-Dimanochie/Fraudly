import './src/aws-config'; // Ensure AWS Amplify is configured immediately
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Unauthorized from './pages/Unauthorized';
import HomePage from './pages/HomePage';
import AuthCallback from './pages/AuthCallback';

const App: React.FC = () => {
  return (
    <Routes>
      {/* Homepage: default entry point */}
      <Route path="/" element={<HomePage />} />

      {/* Login route */}
      <Route path="/login" element={<Login />} />

      {/* OAuth callback route - Critical for Cognito Flow */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Unauthorized access page */}
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Protected dashboard route */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirects to homepage */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;