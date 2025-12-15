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

const LOGIN_ERROR_KEY = "LOGIN_ERROR";
const AUTH_LOCKED_KEY = "AUTH_LOCKED";
const LOGIN_PENDING_KEY = "LOGIN_PENDING";
const LOGIN_PENDING_AT_KEY = "LOGIN_PENDING_AT";

// ✅ NEW: prevents infinite banned loop, allows exactly one bounce
const BANNED_LOOP_KEY = "BANNED_LOOP_ONCE";

// how long we wait after clicking sign-in before declaring failure
const LOGIN_WATCHDOG_MS = 9000;

const Login: React.FC = () => {
  const [localError, setLocalError] = useState<string | null>(null);
  const [authLocked, setAuthLocked] = useState(false);

  const { user, isLoading, error: ctxError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const signedOutOnce = useRef(false);
  const watchdogTimer = useRef<number | null>(null);

  const displayError = localError || ctxError;

  const clearWatchdog = () => {
    if (watchdogTimer.current) {
      window.clearTimeout(watchdogTimer.current);
      watchdogTimer.current = null;
    }
  };

  const setPersistentError = (msg: string) => {
    sessionStorage.setItem(LOGIN_ERROR_KEY, msg);
    setLocalError(msg);
  };

  const clearPersistentError = () => {
    sessionStorage.removeItem(LOGIN_ERROR_KEY);
    setLocalError(null);
  };

  const clearPending = () => {
    sessionStorage.removeItem(LOGIN_PENDING_KEY);
    sessionStorage.removeItem(LOGIN_PENDING_AT_KEY);
  };

  // ✅ Load lock + stored error on mount
  useEffect(() => {
    const locked = sessionStorage.getItem(AUTH_LOCKED_KEY) === "1";
    const storedError = sessionStorage.getItem(LOGIN_ERROR_KEY);

    setAuthLocked(locked);
    if (storedError) setLocalError(storedError);
  }, []);

  // ✅ If we reach dashboard conditions, clear error/pending and navigate
  useEffect(() => {
    if (!authLocked && user && !user.isBanned) {
      clearWatchdog();
      clearPending();
      clearPersistentError();

      // ✅ login succeeded; reset banned loop guard
      sessionStorage.removeItem(BANNED_LOOP_KEY);

      navigate("/dashboard", { replace: true });
    }
  }, [user, authLocked, navigate]);

  /**
   * ✅ BANNED behavior:
   * - We WANT the old loop again, BUT ONLY ONCE.
   * - On first detection of banned user:
   *   -> lock
   *   -> persist banned message
   *   -> signOut globally
   *   -> navigate /login (once)
   * - On subsequent renders while still banned:
   *   -> just show message, do not signOut/navigate again
   */
  useEffect(() => {
    if (!user?.isBanned) return;

    setAuthLocked(true);
    sessionStorage.setItem(AUTH_LOCKED_KEY, "1");

    // persist banned message (doesn't get overwritten by watchdog)
    setPersistentError("Account is banned");

    clearWatchdog();
    clearPending();

    const alreadyLooped = sessionStorage.getItem(BANNED_LOOP_KEY) === "1";

    // 🔁 allow exactly one bounce
    if (!alreadyLooped) {
      sessionStorage.setItem(BANNED_LOOP_KEY, "1");

      if (!signedOutOnce.current) {
        signedOutOnce.current = true;

        signOut({ global: true })
          .catch(() => {})
          .finally(() => {
            navigate("/login", { replace: true });
          });
      }
    }
  }, [user, navigate]);

  /**
   * ✅ Watchdog logic:
   * Only show "Sign in failed" if:
   * - user clicked sign in (pending=1)
   * - still on /login after timeout
   * - NOT locked (banned)
   */
  useEffect(() => {
    clearWatchdog();

    const pending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
    const pendingAt = Number(sessionStorage.getItem(LOGIN_PENDING_AT_KEY) || "0");

    if (!pending) return;

    // if already timed out (e.g. reload), show error immediately
    const elapsed = pendingAt ? Date.now() - pendingAt : 0;
    const remaining = Math.max(0, LOGIN_WATCHDOG_MS - elapsed);

    // only apply while on login
    if (location.pathname !== "/login") return;

    watchdogTimer.current = window.setTimeout(() => {
      const stillPending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
      if (!stillPending) return;

      const locked = sessionStorage.getItem(AUTH_LOCKED_KEY) === "1";
      if (locked) return; // don't override banned

      clearPending();
      setPersistentError("Sign in failed. Please try again.");
    }, remaining);

    return () => clearWatchdog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleSSOLogin = async () => {
    // user is explicitly trying again: unlock + clear old error
    setAuthLocked(false);
    sessionStorage.removeItem(AUTH_LOCKED_KEY);
    clearPersistentError();

    // mark pending attempt
    sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
    sessionStorage.setItem(LOGIN_PENDING_AT_KEY, String(Date.now()));

    // start watchdog immediately (in case Cognito bounces right back)
    clearWatchdog();
    watchdogTimer.current = window.setTimeout(() => {
      const stillPending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
      const locked = sessionStorage.getItem(AUTH_LOCKED_KEY) === "1";
      if (stillPending && !locked) {
        clearPending();
        setPersistentError("Sign in failed. Please click “Sign in with Cognito” again.");
      }
    }, LOGIN_WATCHDOG_MS);

    try {
      // avoid stuck sessions
      await signOut().catch(() => {});
      await signInWithRedirect();
    } catch (err: any) {
      console.error("SSO login failed:", err);
      clearWatchdog();
      clearPending();
      setPersistentError("Failed to start login. Please try again.");
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
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 rounded-md shadow-sm
                       text-sm font-bold text-white bg-blue-600 hover:bg-blue-700
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                       disabled:opacity-60"
          >
            {isLoading ? "Signing in..." : "Sign in with Cognito"}
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
