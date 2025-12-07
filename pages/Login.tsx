import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { login, user, isLoading, error } = useAuth();
  const navigate = useNavigate();

  // Redirect user ONLY after successful login
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      /**
       * ⭐ AWS Cognito Integration Point ⭐
       * ---------------------------------
       * In the future, when you integrate Cognito, replace this line:
       *        await login(email, password);
       * with:
       *        await cognitoSignIn(email, password);
       *
       * Your AuthContext is already structured so you can simply swap the function.
       * ALL redirect + error handling stays the same.
       */
      await login(email, password);

      // Navigation is controlled by the useEffect after login success.
    } catch (err) {
      // Error is handled inside AuthContext so this is just a fallback.
      console.error("Login failed:", err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Use any email and password. <br />
            <code className="bg-gray-100 p-1 rounded">admin@company.com</code> for Admin view. <br />
            <code className="bg-gray-100 p-1 rounded">employee@company.com</code> for Employee view.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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

          {error && (
            <p className="text-red-500 text-sm mt-2 text-center">{error}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent 
                         text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 
                         mt-6 disabled:bg-indigo-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
