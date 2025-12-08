// import './src/aws-config'; // AWS Amplify configuration
// import React, { useEffect, useState } from 'react';
// import { Routes, Route, Navigate } from 'react-router-dom';
// import { ProtectedRoute } from './components/ProtectedRoute';
// import Login from './pages/Login';
// import Dashboard from './pages/Dashboard';
// import Unauthorized from './pages/Unauthorized';
// import HomePage from './pages/HomePage';
// import AuthCallback from './pages/AuthCallback';
// import { useAuth } from './context/AuthContext';
// import { getCurrentUser } from 'aws-amplify/auth';

// /**
//  * App.tsx
//  * 
//  * Uses AWS Cognito for authentication
//  * 
//  * Wraps protected routes with ProtectedRoute
//  * 
//  * Role-based redirects handled in Login.tsx
//  */
// const App: React.FC = () => {
//   const { user } = useAuth();

//   // -------------------------
//   // AWS Cognito: check active session
//   // -------------------------
//   const [isCheckingUser, setIsCheckingUser] = useState(true);

//   useEffect(() => {
//     const checkUser = async () => {
//       try {
//         const currentUser = await getCurrentUser();
//         // If we get here, user is logged in
//         console.log('Cognito user session active:', currentUser);
//       } catch (e) {
//         // No active session - this is normal if user hasn't logged in yet
//         console.log('No active Cognito session - user needs to login');
//       } finally {
//         setIsCheckingUser(false);
//       }
//     };
//     checkUser();
//   }, []);

//   if (isCheckingUser) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-gray-50">
//         <p className="text-gray-600">Loading session...</p>
//       </div>
//     );
//   }

//   return (
//     <Routes>
//       {/* Homepage: default entry point */}
//       <Route path="/" element={<HomePage />} />

//       {/* Login route */}
//       <Route path="/login" element={<Login />} />

//       {/* OAuth callback route */}
//       <Route path="/auth/callback" element={<AuthCallback />} />

//       {/* Unauthorized access page */}
//       <Route path="/unauthorized" element={<Unauthorized />} />

//       {/* Protected dashboard route */}
//       <Route
//         path="/dashboard"
//         element={
//           <ProtectedRoute>
//             <Dashboard />
//           </ProtectedRoute>
//         }
//       />

//       {/* Catch-all redirects to homepage */}
//       <Route path="*" element={<Navigate to="/" replace />} />
//     </Routes>
//   );
// };

// export default App;

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