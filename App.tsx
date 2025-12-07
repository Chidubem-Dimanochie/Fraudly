
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Unauthorized from './pages/Unauthorized';
import { useAuth } from './context/AuthContext';

const App: React.FC = () => {
  const { user } = useAuth();
  
  // ** AWS Cognito Integration Point **
  // To check for an active session when the app loads, you would use a `useEffect` hook here.
  // This is often combined with a global loading state to prevent screen flicker.
  //
  // import { Auth } from 'aws-amplify';
  // import { useState, useEffect } from 'react';
  //
  // const [isCheckingUser, setIsCheckingUser] = useState(true);
  //
  // useEffect(() => {
  //   const checkUser = async () => {
  //     try {
  //       await Auth.currentAuthenticatedUser();
  //       // If the above line doesn't throw, a user is signed in.
  //       // The AuthProvider context would then be updated to reflect this session.
  //     } catch (e) {
  //       // No user is signed in.
  //     }
  //     setIsCheckingUser(false);
  //   };
  //   checkUser();
  // }, []);
  //
  // if (isCheckingUser) {
  //   return <div>Loading...</div>; // Or a spinner component
  // }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
      
      {/* Root path navigation logic */}
      <Route 
        path="/" 
        element={
            user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
        } 
      />

      {/* Catch-all route to redirect to the dashboard or login */}
      <Route 
        path="*" 
        element={<Navigate to="/" replace />} 
      />
    </Routes>
  );
};

export default App;
