import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { signInWithRedirect, signOut } from "aws-amplify/auth";

const Shield: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

// ✅ Only keep a persistent lock for banned users
const AUTH_LOCKED_KEY = "AUTH_LOCKED";

// ✅ "pending login attempt" markers
const LOGIN_PENDING_KEY = "LOGIN_PENDING";
const LOGIN_PENDING_AT_KEY = "LOGIN_PENDING_AT";

const LOGIN_WATCHDOG_MS = 9000;

const Login: React.FC = () => {
  const [localError, setLocalError] = useState<string | null>(null);
  const [authLocked, setAuthLocked] = useState(false);

  const { user, isLoading, error: ctxError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const signedOutOnce = useRef(false);
  const watchdogTimer = useRef<number | null>(null);

  // ✅ Only show ctxError if NOT logged out and NOT something we cleared
  const displayError = localError || ctxError;

  const clearWatchdog = () => {
    if (watchdogTimer.current) {
      window.clearTimeout(watchdogTimer.current);
      watchdogTimer.current = null;
    }
  };

  const clearPending = () => {
    sessionStorage.removeItem(LOGIN_PENDING_KEY);
    sessionStorage.removeItem(LOGIN_PENDING_AT_KEY);
  };

  /**
   * ✅ NEW RULE:
   * - "Sign in failed" is NOT stored/persisted.
   * - Only "banned lock" persists.
   */

  // ✅ On mount: if this is a normal visit to /login, DO NOT show errors by default.
  useEffect(() => {
    const loggedOut = (location.state as any)?.loggedOut;

    // If user explicitly logged out, clear everything
    if (loggedOut) {
      clearWatchdog();
      clearPending();
      sessionStorage.removeItem(AUTH_LOCKED_KEY);
      setAuthLocked(false);
      setLocalError(null);

      // clear the location state
      navigate("/login", { replace: true, state: {} });
      return;
    }

    // If locked (banned), show banned message
    const locked = sessionStorage.getItem(AUTH_LOCKED_KEY) === "1";
    setAuthLocked(locked);

    if (locked) {
      setLocalError("Account is banned");
    } else {
      // ✅ IMPORTANT: Never keep old "sign in failed" hanging around
      setLocalError(null);
      // also clear any stale pending markers from older sessions
      clearPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ If we reach dashboard conditions, clear pending + errors and navigate
  useEffect(() => {
    if (!authLocked && user && !user.isBanned) {
      clearWatchdog();
      clearPending();
      setLocalError(null);
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLocked, navigate]);

  // ✅ If banned ever shows up in state, lock + show message + sign out once
  useEffect(() => {
    if (user?.isBanned) {
      setAuthLocked(true);
      sessionStorage.setItem(AUTH_LOCKED_KEY, "1");
      setLocalError("Account is banned");

      clearWatchdog();
      clearPending();

      if (!signedOutOnce.current) {
        signedOutOnce.current = true;
        signOut({ global: true }).catch(() => {});
      }
    }
  }, [user]);

  /**
   * ✅ Watchdog:
   * Only shows "Sign in failed" if the user *started* login (pending=1)
   * and we still ended up stuck on /login after the timeout.
   */
  useEffect(() => {
    clearWatchdog();

    // never show sign-in failed if banned locked
    if (authLocked) return;

    const pending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
    const pendingAt = Number(sessionStorage.getItem(LOGIN_PENDING_AT_KEY) || "0");
    if (!pending) return;

    const elapsed = pendingAt ? Date.now() - pendingAt : 0;
    const remaining = Math.max(0, LOGIN_WATCHDOG_MS - elapsed);

    if (location.pathname !== "/login") return;

    watchdogTimer.current = window.setTimeout(() => {
      const stillPending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
      if (!stillPending) return;

      // ✅ Show error once, but do NOT persist it
      clearPending();
      setLocalError("Sign in failed. Please try again.");
    }, remaining);

    return () => clearWatchdog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, authLocked]);

  const handleSSOLogin = async () => {
    // user is explicitly trying again
    setLocalError(null);
    setAuthLocked(false);
    sessionStorage.removeItem(AUTH_LOCKED_KEY);

    // mark pending attempt
    sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
    sessionStorage.setItem(LOGIN_PENDING_AT_KEY, String(Date.now()));

    clearWatchdog();
    watchdogTimer.current = window.setTimeout(() => {
      const stillPending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
      const locked = sessionStorage.getItem(AUTH_LOCKED_KEY) === "1";
      if (stillPending && !locked) {
        clearPending();
        setLocalError("Sign in failed. Please click “Sign in with Cognito” again.");
      }
    }, LOGIN_WATCHDOG_MS);

    try {
      // avoid stuck sessions
      await signOut({ global: true }).catch(() => {});
      await signInWithRedirect();
    } catch (err: any) {
      console.error("SSO login failed:", err);
      clearWatchdog();
      clearPending();
      setLocalError("Failed to start login. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 relative">
      <div className="mb-8">
        <Link to="/" className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100">
          <Shield className="w-10 h-10 text-blue-600" />
          <span className="text-2xl font-bold text-gray-900">Fraudly</span>
        </Link>
      </div>

      <div className="max-w-md w-full bg-white p-10 rounded-xl shadow-lg">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
        <p className="mt-2 text-center text-sm text-gray-600">Secure login via Cognito</p>

        <div className="mt-8">
          <button
            onClick={handleSSOLogin}
            disabled={isLoading || authLocked}
            className="w-full flex justify-center py-3 px-4 rounded-md shadow-sm
                       text-sm font-bold text-white bg-blue-600 hover:bg-blue-700
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                       disabled:opacity-60"
          >
            {authLocked ? "Account Banned" : isLoading ? "Signing in..." : "Sign in with Cognito"}
          </button>
        </div>

        {displayError && (
          <div className="rounded-md bg-red-50 p-4 mt-4">
            <p className="text-sm text-red-800">
              {String(displayError).toLowerCase().includes("banned") ||
              String(displayError).toLowerCase().includes("suspended")
                ? "Account is banned. Please contact support."
                : displayError}
            </p>
          </div>
        )}

        <div className="text-center mt-6">
          <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-500 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
