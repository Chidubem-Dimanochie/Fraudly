import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signInWithRedirect, signOut } from 'aws-amplify/auth';

const Shield: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, user, isLoading, error } = useAuth();
  const navigate = useNavigate();

  // Redirect user ONLY if they are already fully authenticated (e.g. session exists)
  // We do NOT auto-redirect to Cognito here to prevent infinite loops.
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) return;

    try {
      // Local/Mock login fallback
      await login(email, password);
    } catch (err: any) {
      console.error("Login failed:", err);
      setLocalError(err.message || "Login failed");
    }
  };

  const handleSSOLogin = async () => {
    setLocalError(null);
    try {
      // Triggers the AWS Cognito Hosted UI redirect
      await signInWithRedirect();
    } catch (err: any) {
      console.error("Failed to start SSO flow:", err);
      
      // Handle case where user is already signed in
      if (err.name === 'UserAlreadyAuthenticatedException') {
        // Sign out first, then try again
        try {
          await signOut();
          await signInWithRedirect();
        } catch (retryErr) {
          console.error("Retry failed:", retryErr);
          setLocalError("Please refresh the page and try again.");
        }
      } else {
        setLocalError("Failed to start SSO login. Please try again.");
      }
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8 relative">
      
      {/* Back to Home Link - Top Shield Icon */}
      <div className="mb-8 relative z-10">
        <Link to="/" className="flex items-center gap-2 group p-2 rounded-lg hover:bg-gray-100 transition-colors">
           <Shield className="w-10 h-10 text-blue-600" />
           <span className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Fraudly</span>
        </Link>
      </div>

      <div className="max-w-md w-full bg-white p-10 rounded-xl shadow-lg relative z-10"> 
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Select your preferred login method
          </p>
        </div>

        <div className="mt-8 space-y-6">
          
          {/* PRIMARY METHOD: Cognito SSO */}
          <div>
            <button
              onClick={handleSSOLogin}
              type="button"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Sign in with Cognito
            </button>
            <p className="text-xs text-center text-gray-400 mt-2">
              
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
            {/* <span className="px-2 bg-white text-gray-500">Or use legacy credentials</span> */}
            </div>
          </div>

          {/* SECONDARY METHOD: Username/Password Form
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="email-address" className="sr-only">Email address</label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border 
                             border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md 
                             focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 
                             focus:z-10 sm:text-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border 
                             border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md 
                             focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 
                             focus:z-10 sm:text-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {displayError && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{displayError}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 
                           text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 
                           disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Signing in...' : 'Sign in with Password'} */}
              {/* </button> */}
            </div>
          {/* </form> */}
        </div>

        {/* Back to Home Link - Bottom Text */}
        <div className="text-center mt-6">
            <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-500 font-medium">
                &larr; Back to Home
            </Link>
        </div>
      </div>
    //</div>
  );
};

export default Login;