import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

/**
 * AuthCallback Page
 * 
 * Handles the OAuth redirect from Cognito.
 * Critically, it uses Hub to listen for the 'signInWithRedirect' event
 * to ensure tokens are exchanged before attempting to sync user data.
 */
const AuthCallback: React.FC = () => {
  const { user, syncUserFromCognito } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing authentication...");

  // 1. Immediate Redirect: If AuthContext already knows we are logged in, 
  // skip the waiting and go straight to dashboard.
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    let isMounted = true;

    const handleAuthSuccess = async () => {
      if (!isMounted) return;
      try {
        setStatus("Synchronizing user profile...");
        await syncUserFromCognito();
        // Navigation is handled by the useEffect on [user] above, 
        // but we add it here as a fallback for the async flow.
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error("Sync error:", err);
        setStatus("Error syncing profile. Redirecting...");
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    // 2. Listen for the specific Hub event that signals OAuth success
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
          console.log('Hub: Sign in with redirect successful');
          handleAuthSuccess();
          break;
        case 'signInWithRedirect_failure':
          console.error('Hub: Sign in failure', payload.data);
          setStatus("Authentication failed. Please try again.");
          setTimeout(() => navigate('/login'), 2000);
          break;
      }
    });

    // 3. Check if we are already authenticated (e.g. page reload after successful redirect)
    // We catch the error silently here because if we aren't signed in,
    // the Hub listener above will catch the completion of the flow.
    getCurrentUser()
      .then(() => {
        console.log('Check: User already authenticated');
        handleAuthSuccess();
      })
      .catch(() => {
        console.log('Check: Waiting for auth flow to complete...');
      });

    // 4. Safety Timeout
    // If for some reason Amplify doesn't fire an event within 6 seconds 
    // (e.g. used code, network issue), redirect to login to break the hang.
    const safetyTimer = setTimeout(() => {
        if (isMounted && !user) {
            console.warn("Auth timeout reached.");
            setStatus("Session timed out. Redirecting...");
            setTimeout(() => navigate('/login'), 1000);
        }
    }, 6000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, [navigate, syncUserFromCognito, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-sm w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Logging in</h2>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
};

export default AuthCallback;