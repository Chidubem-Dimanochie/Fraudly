import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

/**
 * AuthCallback Page
 *
 * Handles the OAuth redirect from Cognito.
 * Uses Hub to wait for signInWithRedirect completion before syncing Mongo user.
 *
 * Key behavior:
 * - If user is banned -> signOut + redirect to /login with "Account is banned"
 * - Avoid redirect loops by ensuring we do not navigate to /dashboard if banned
 * - Avoid double-sync calls with a ref gate
 */
const AuthCallback: React.FC = () => {
  const { user, syncUserFromCognito } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing authentication...");

  const startedRef = useRef(false);
  const isMountedRef = useRef(true);

// ✅ Helper: redirect to login with message (survives full reloads)
const goToLoginWithError = async (message: string) => {
  try {
    await signOut({ global: true }); // stronger signout
  } catch {}

  // ✅ lock login screen until user clicks the button
  sessionStorage.setItem("AUTH_LOCKED", "1");
  sessionStorage.setItem("LOGIN_ERROR", message);

  if (!isMountedRef.current) return;
  navigate("/login", { replace: true });
};



  // ✅ If AuthContext already has a user, only go to dashboard if NOT banned
  useEffect(() => {
    if (user) {
      if (user.isBanned) {
        goToLoginWithError("Account is banned");
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  useEffect(() => {
    isMountedRef.current = true;

    const handleAuthSuccess = async () => {
      // prevent double execution from both Hub + getCurrentUser() race
      if (startedRef.current) return;
      startedRef.current = true;

      try {
        if (!isMountedRef.current) return;
        setStatus("Synchronizing user profile...");

        await syncUserFromCognito();

        // ✅ At this point, AuthContext should set user or throw.
        // Navigation is handled by [user] effect above.
      } catch (err: any) {
        console.error("Sync error:", err);

        const msg = String(err?.message || "").toLowerCase();

        // ✅ If banned: hard stop + message
        if (msg.includes("banned") || msg.includes("suspended")) {
          setStatus("Account is banned. Redirecting...");
          await goToLoginWithError("Account is banned");
          return;
        }

        setStatus("Error syncing profile. Redirecting...");
        setTimeout(() => {
          if (isMountedRef.current) {
            navigate("/login", { replace: true, state: { error: "Login failed" } });
          }
        }, 1200);
      }
    };

    // 1) Listen for Hub auth events
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signInWithRedirect":
          console.log("Hub: signInWithRedirect success");
          handleAuthSuccess();
          break;
        case "signInWithRedirect_failure":
          console.error("Hub: signInWithRedirect failure", payload.data);
          setStatus("Authentication failed. Redirecting...");
          setTimeout(() => {
            if (isMountedRef.current) {
              navigate("/login", {
                replace: true,
                state: { error: "Authentication failed. Please try again." },
              });
            }
          }, 1200);
          break;
      }
    });

    // 2) If user already authenticated (reload after redirect), proceed
    getCurrentUser()
      .then(() => {
        console.log("Check: user already authenticated");
        handleAuthSuccess();
      })
      .catch(() => {
        console.log("Check: waiting for auth flow to complete...");
      });

    // 3) Safety timeout (avoid hanging forever)
    const safetyTimer = setTimeout(() => {
      if (!startedRef.current && isMountedRef.current && !user) {
        console.warn("Auth timeout reached.");
        setStatus("Session timed out. Redirecting...");
        setTimeout(() => {
          if (isMountedRef.current) {
            navigate("/login", {
              replace: true,
              state: { error: "Session timed out. Please try again." },
            });
          }
        }, 900);
      }
    }, 8000);

    return () => {
      isMountedRef.current = false;
      unsubscribe();
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, syncUserFromCognito]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-sm w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Logging in</h2>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
