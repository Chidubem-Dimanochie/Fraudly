import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from "aws-amplify/auth";

// -------------------------
// Types
// -------------------------
export enum UserRole {
  Customer = "Customer",
  Employee = "Employee",
  Admin = "Admin",
}

export interface User {
  username: string;
  email: string;
  fullName?: string;
  role: UserRole;
  balance: number;
  cardFrozen: boolean;
  alertThreshold: number | null;
  isBanned: boolean;
}

const API_BASE_URL = "http://localhost:8000/api";

interface AuthContextType {
  user: User | null;
  users: User[];
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  syncUserFromCognito: () => Promise<void>;

  refreshUsers: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;

  updateUser: (updatedData: Partial<User>) => Promise<void>;
  updateUserDetails: (username: string, updatedData: Partial<User>) => Promise<void>;

  transferFunds: (recipientEmail: string, amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ensureValidSession = async (): Promise<boolean> => {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      return !!session.tokens?.accessToken;
    } catch (err: any) {
      console.error("❌ Session refresh failed:", err?.message);
      return false;
    }
  };

  const refreshUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users`);
      if (!res.ok) throw new Error("Failed to fetch users.");
      const allUsers: User[] = await res.json();
      setUsers(allUsers);
    } catch (e) {
      console.warn("⚠️ refreshUsers failed:", e);
    }
  };

  const refreshCurrentUser = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/users/by-email/${encodeURIComponent(user.email)}`
      );
      if (!res.ok) return;
      const fresh: User = await res.json();
      setUser(fresh);
      setUsers((prev) => prev.map((u) => (u.username === fresh.username ? fresh : u)));
    } catch (e) {
      console.warn("⚠️ refreshCurrentUser failed:", e);
    }
  };

  // ✅ Cognito attributes (frontend-only)
  const getNameFromCognitoAttributes = async (): Promise<string | undefined> => {
    try {
      const attrs = await fetchUserAttributes();
      const name = (attrs as any)?.name || (attrs as any)?.["custom:name"];
      return name && name.trim().length > 0 ? name.trim() : undefined;
    } catch (e) {
      console.warn("⚠️ fetchUserAttributes failed:", e);
      return undefined;
    }
  };

  // ✅ When banned: signOut + clear local user + throw "Account is banned"
  const handleBannedUser = async () => {
    setUser(null);
    setError("Account is banned");
    try {
      await signOut();
    } catch (e) {
      console.warn("⚠️ signOut failed while banning:", e);
    }
    throw new Error("Account is banned");
  };

  // -------------------------
  // Core Sync (Mongo source of truth)
  // - find by email
  // - create if missing
  // - fill missing fullName
  // - if banned -> signOut + throw
  // -------------------------
  const performSync = async (cognitoUsername: string, email: string) => {
    console.log("🔄 Sync start:", { cognitoUsername, email });

    // 1) Find Mongo user by email
    let existingUser: User | null = null;
    try {
      const res = await fetch(
        `${API_BASE_URL}/users/by-email/${encodeURIComponent(email)}`
      );
      if (res.ok) {
        existingUser = (await res.json()) as User;
      }
    } catch (e) {
      console.warn("⚠️ /users/by-email lookup failed:", e);
    }

    // 2) Create if missing
    if (!existingUser) {
      const fullNameFromAttrs = await getNameFromCognitoAttributes();

      const newUser: User = {
        username: cognitoUsername,
        email,
        fullName: fullNameFromAttrs,
        role: UserRole.Customer, // ✅ do NOT set from Cognito groups
        balance: 10000,
        cardFrozen: false,
        alertThreshold: null,
        isBanned: false,
      };

      const createRes = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      if (!createRes.ok) {
        const t = await createRes.text();
        throw new Error(t || "Failed to create user");
      }

      existingUser = (await createRes.json()) as User;
    }

    // ✅ Ban check immediately after we have Mongo user
    if (existingUser.isBanned) {
      await handleBannedUser();
      return; // (unreachable, but keeps TS happy)
    }

    // 3) Fill missing fullName (Mongo)
    if (!existingUser.fullName) {
      const fullNameFromAttrs = await getNameFromCognitoAttributes();
      if (fullNameFromAttrs) {
        try {
          const updateRes = await fetch(
            `${API_BASE_URL}/users/email/${encodeURIComponent(email)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fullName: fullNameFromAttrs }),
            }
          );

          if (updateRes.ok) {
            existingUser = (await updateRes.json()) as User;
          }
        } catch (e) {
          console.warn("⚠️ fullName update exception:", e);
        }
      }
    }

    // ✅ Ban check again (in case it was updated while syncing)
    if (existingUser.isBanned) {
      await handleBannedUser();
      return;
    }

    setUser(existingUser);
    await refreshUsers();
  };

  // -------------------------
  // INITIAL LOAD
  // -------------------------
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      setError(null);

      try {
        await refreshUsers();

        try {
          const cognitoUser = await getCurrentUser();

          const hasValidSession = await ensureValidSession();
          if (!hasValidSession) {
            await signOut();
            setUser(null);
            return;
          }

          const session = await fetchAuthSession();
          const idTokenPayload = session.tokens?.idToken?.payload || {};
          const email = idTokenPayload.email as string | undefined;

          if (!email) throw new Error("Email not found in session");

          await performSync(cognitoUser.username, email);
        } catch (err: any) {
          // ✅ if banned, performSync already handled signOut + error
          if (String(err?.message || "").toLowerCase().includes("banned")) {
            return;
          }
          console.log("ℹ️ No active session found.");
        }
      } catch (e: any) {
        setError("Could not connect to the backend server. Is it running on port 8000?");
        console.error("❌ Initialization error:", e);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // EXPOSED: Sync User (AuthCallback calls this)
  // -------------------------
  const syncUserFromCognito = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const hasValidSession = await ensureValidSession();
      if (!hasValidSession) throw new Error("Could not obtain valid session");

      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idTokenPayload = session.tokens?.idToken?.payload || {};
      const email = idTokenPayload.email as string | undefined;

      if (!email) throw new Error("Missing email from Cognito ID token");

      await performSync(cognitoUser.username, email);
    } catch (err: any) {
      // ✅ If banned, make sure error is exactly what Login expects
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("banned")) {
        setError("Account is banned");
        throw new Error("Account is banned");
      }

      console.error("❌ Sync failed:", err);
      setError(msg || "Sync failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  // LOGIN
  // -------------------------
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { isSignedIn } = await signIn({ username: email, password });
      if (isSignedIn) await syncUserFromCognito();
    } catch (err: any) {
      setError(err?.message || "Login failed.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  // LOGOUT
  // -------------------------
  const logout = async () => {
    try {
      await signOut();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error("❌ Logout error:", err);
    }
  };

  // -------------------------
  // UPDATE LOGGED-IN USER (DB + local)
  // ✅ never send role
  // -------------------------
  const updateUser = async (updatedData: Partial<User>) => {
    if (!user) return;

    const { role, ...safeData } = updatedData as any;

    try {
      const res = await fetch(`${API_BASE_URL}/users/${user.username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeData),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to update user.");
      }

      const updatedUser: User = await res.json();
      setUser(updatedUser);
      setUsers((prev) =>
        prev.map((u) => (u.username === user.username ? updatedUser : u))
      );
    } catch (e) {
      console.error("❌ Error updating user:", e);
      alert("Error updating user details.");
    }
  };

  // -------------------------
  // ADMIN UPDATE ANY USER
  // ✅ never send role
  // -------------------------
  const updateUserDetails = async (username: string, updatedData: Partial<User>) => {
    const { role, ...safeData } = updatedData as any;

    try {
      const res = await fetch(`${API_BASE_URL}/users/${username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeData),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to update user.");
      }

      const updatedUser: User = await res.json();
      setUsers((prev) => prev.map((u) => (u.username === username ? updatedUser : u)));
      if (user?.username === username) setUser(updatedUser);
    } catch (e) {
      console.error("❌ Error updating user:", e);
      alert("Error updating user details.");
    }
  };

  // -------------------------
  // TRANSFER FUNDS
  // -------------------------
  const transferFunds = async (recipientEmail: string, amount: number) => {
    if (!user) throw new Error("No user logged in.");
    if (amount <= 0) throw new Error("Amount must be positive.");

    const recipient = users.find((u) => u.email === recipientEmail);
    if (!recipient) throw new Error("Recipient not found.");
    if (user.balance < amount) throw new Error("Insufficient funds.");

    const updatedSender: User = { ...user, balance: user.balance - amount };
    const updatedRecipient: User = { ...recipient, balance: recipient.balance + amount };

    setUser(updatedSender);
    setUsers((prev) =>
      prev.map((u) =>
        u.username === user.username
          ? updatedSender
          : u.username === recipient.username
          ? updatedRecipient
          : u
      )
    );

    await Promise.all([
      fetch(`${API_BASE_URL}/users/${user.username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: updatedSender.balance }),
      }),
      fetch(`${API_BASE_URL}/users/${recipient.username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: updatedRecipient.balance }),
      }),
    ]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        isLoading,
        error,
        login,
        logout,
        syncUserFromCognito,
        refreshUsers,
        refreshCurrentUser,
        updateUser,
        updateUserDetails,
        transferFunds,
      }}
    >
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Connecting to secure server...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
