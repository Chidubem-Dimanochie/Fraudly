import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
import { signIn, signOut, getCurrentUser } from "aws-amplify/auth";
import { fetchAuthSession } from "aws-amplify/auth";

// -------------------------
// Types
// -------------------------
export enum UserRole {
  Customer = "Customer",
  Employee = "Employee",
  Admin = "Admin",
}

export interface User {
  username: string; // Cognito username (unique identifier)
  email: string; // User's email address
  fullName?: string; // Single full name field
  role: UserRole;
  balance: number;
  cardFrozen: boolean;
  alertThreshold: number | null;
  isBanned: boolean;
}

// -------------------------
// API base URL
// -------------------------
const API_BASE_URL = "http://localhost:8000/api";

// -------------------------
interface AuthContextType {
  user: User | null;
  users: User[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncUserFromCognito: () => Promise<void>;
  updateUser: (updatedData: Partial<User>) => void;
  updateUserDetails: (username: string, updatedData: Partial<User>) => void;
  transferFunds: (recipientEmail: string, amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// -------------------------
export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -------------------------
  // HELPER: Refresh tokens if needed
  // -------------------------
  const ensureValidSession = async (): Promise<boolean> => {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });

      if (session.tokens?.accessToken) {
        console.log("✅ Valid session obtained");
        return true;
      }

      console.warn("⚠️ No valid tokens after refresh");
      return false;
    } catch (err: any) {
      console.error("❌ Session refresh failed:", err.message);
      return false;
    }
  };

  // -------------------------
  // INITIAL LOAD
  // -------------------------
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        console.log("🚀 Initializing auth...");

        // 1. Check if backend is alive and get users
        const res = await fetch(`${API_BASE_URL}/users`);
        if (!res.ok) throw new Error("Failed to fetch users from backend.");
        const allUsers: User[] = await res.json();
        setUsers(allUsers);
        console.log("✅ Fetched users from backend:", allUsers.length);

        // 2. Check if a Cognito session exists
        try {
          const cognitoUser = await getCurrentUser();
          console.log("🔍 Cognito user found:", cognitoUser);

          // 3. Ensure we have valid tokens (refresh if needed)
          const hasValidSession = await ensureValidSession();

          if (!hasValidSession) {
            console.log("❌ Could not obtain valid session, signing out...");
            await signOut();
            return;
          }

          // 4. Get email + full name from ID token (Cognito "Name" field)
          const username = cognitoUser.username;
          const session = await fetchAuthSession();
          const idToken = session.tokens?.idToken?.payload || {};
          const email = idToken.email as string | undefined;
          const fullName = idToken.name as string | undefined; // 👈 full name

          console.log("📧 Username:", username);
          console.log("📧 Email from ID token:", email);
          console.log("📛 Full name from Cognito:", fullName);

          if (!email) {
            console.error("❌ No email found in ID token");
            throw new Error("Email not found in session");
          }

          if (username && email) {
            await performSync(username, email, fullName, allUsers);
          }
        } catch (e: any) {
          // No user signed in
          console.log("ℹ️ No active session found.");
        }
      } catch (e: any) {
        setError(
          "Could not connect to the backend server. Is it running on port 8000?"
        );
        console.error("❌ Initialization error:", e);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // -------------------------
  // HELPER: Determine role from Cognito groups
  // -------------------------
  const getRoleFromCognito = async (): Promise<UserRole> => {
    let role: UserRole = UserRole.Customer;
    try {
      const session = await fetchAuthSession();
      const groups = session.tokens?.accessToken?.payload?.[
        "cognito:groups"
      ] as string[] | undefined;
      console.log("🔍 Cognito groups:", groups);

      if (groups && groups.length > 0) {
        if (groups.includes("Admin")) role = UserRole.Admin;
        else if (groups.includes("Employee")) role = UserRole.Employee;
        else role = UserRole.Customer;
      }
    } catch (err) {
      console.warn(
        "⚠️ Could not fetch Cognito groups, defaulting to Customer role"
      );
    }
    return role;
  };

  // -------------------------
  // HELPER: Core Sync Logic
  // -------------------------
  const performSync = async (
    username: string,
    email: string,
    fullNameFromCognito: string | undefined,
    currentUsersList: User[]
  ) => {
    console.log(`🔄 Syncing user: ${username} (${email})`);

    let existingUser = currentUsersList.find((u) => u.username === username);

    if (!existingUser) {
      console.log(`📝 User ${username} not found in MongoDB. Creating...`);

      const role = await getRoleFromCognito();

      const newUser: User = {
        username,
        email,
        fullName: fullNameFromCognito || username, // fallback if name missing
        role,
        balance: 10000,
        cardFrozen: false,
        alertThreshold: null,
        isBanned: false,
      };

      console.log(
        "📤 Sending new user to backend:",
        JSON.stringify(newUser, null, 2)
      );

      try {
        const createRes = await fetch(`${API_BASE_URL}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newUser),
        });

        if (!createRes.ok) {
          const errorText = await createRes.text();
          console.error(
            "❌ Failed to create user. Status:",
            createRes.status
          );
          console.error("❌ Error response:", errorText);

          try {
            const errorJson = JSON.parse(errorText);
            console.error("❌ Parsed error details:", errorJson);
          } catch {
            console.error("❌ Could not parse error as JSON");
          }

          throw new Error(errorText);
        }

        existingUser = (await createRes.json()) as User;
        console.log("✅ User created successfully:", existingUser);

        setUsers((prev) => [...prev, existingUser!]);
      } catch (err) {
        console.error("❌ Error creating user:", err);
        throw err;
      }
    } else {
      console.log("✅ User found in MongoDB:", existingUser);

      // If email changed, update
      if (existingUser.email !== email) {
        console.log(
          `🔄 Email changed from ${existingUser.email} to ${email}, updating...`
        );
        try {
          const updateRes = await fetch(`${API_BASE_URL}/users/${username}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          if (updateRes.ok) {
            existingUser = (await updateRes.json()) as User;
            setUsers((prev) =>
              prev.map((u) => (u.username === username ? existingUser! : u))
            );
          }
        } catch (err) {
          console.warn("⚠️ Could not update email:", err);
        }
      }

      // Optionally update fullName from Cognito if missing
      if (!existingUser.fullName && fullNameFromCognito) {
        const nameUpdate: Partial<User> = { fullName: fullNameFromCognito };
        try {
          console.log("🔄 Updating fullName from Cognito:", nameUpdate);
          const updateRes = await fetch(`${API_BASE_URL}/users/${username}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nameUpdate),
          });

          if (updateRes.ok) {
            existingUser = (await updateRes.json()) as User;
            setUsers((prev) =>
              prev.map((u) => (u.username === username ? existingUser! : u))
            );
          }
        } catch (err) {
          console.warn("⚠️ Could not update fullName:", err);
        }
      }
    }

    if (existingUser?.isBanned) {
      throw new Error("This account has been suspended.");
    }

    setUser(existingUser || null);
  };

  // -------------------------
  // EXPOSED: Sync User (called by Callback page)
  // -------------------------
  const syncUserFromCognito = async () => {
    setIsLoading(true);
    try {
      console.log("🔄 Syncing user from Cognito...");

      const hasValidSession = await ensureValidSession();
      if (!hasValidSession) {
        throw new Error("Could not obtain valid session");
      }

      const cognitoUser = await getCurrentUser();
      const username = cognitoUser.username;
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.payload || {};
      const email = idToken.email as string | undefined;
      const fullName = idToken.name as string | undefined; // 👈 full name

      if (!username || !email) {
        throw new Error("Missing username or email from Cognito");
      }

      console.log("📧 Syncing:", username, email, fullName);

      const res = await fetch(`${API_BASE_URL}/users`);
      const allUsers: User[] = await res.json();
      setUsers(allUsers);

      await performSync(username, email, fullName, allUsers);
      console.log("✅ Sync completed successfully");
    } catch (err: any) {
      console.error("❌ Sync failed:", err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  // LOGIN (Manual Fallback)
  // -------------------------
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { isSignedIn } = await signIn({ username: email, password });
      if (isSignedIn) {
        await syncUserFromCognito();
      }
    } catch (err: any) {
      setError(err.message || "Login failed.");
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
      console.log("✅ Logged out successfully");
    } catch (err) {
      console.error("❌ Logout error:", err);
    }
  };

  // -------------------------
  // UPDATE LOGGED-IN USER
  // -------------------------
  const updateUser = async (updatedData: Partial<User>) => {
    if (!user) return;
    try {
      console.log("🔄 Updating current user:", updatedData);

      const res = await fetch(`${API_BASE_URL}/users/${user.username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });

      if (!res.ok) throw new Error("Failed to update user.");

      const updatedUser: User = await res.json();
      setUser(updatedUser);
      setUsers((prev) =>
        prev.map((u) => (u.username === user.username ? updatedUser : u))
      );
      console.log("✅ User updated successfully");
    } catch (e) {
      console.error("❌ Error updating user:", e);
      alert("Error updating user details.");
    }
  };

  // -------------------------
  // ADMIN UPDATE ANY USER
  // -------------------------
  const updateUserDetails = async (
    username: string,
    updatedData: Partial<User>
  ) => {
    try {
      console.log(`🔄 Updating user ${username}:`, updatedData);

      const res = await fetch(`${API_BASE_URL}/users/${username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });

      if (!res.ok) throw new Error("Failed to update user.");

      const updatedUser: User = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.username === username ? updatedUser : u))
      );
      console.log("✅ User updated successfully");
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

    try {
      console.log(`💸 Transferring $${amount} to ${recipientEmail}`);

      const updatedSender: User = {
        ...user,
        balance: user.balance - amount,
      };
      const updatedRecipient: User = {
        ...recipient,
        balance: recipient.balance + amount,
      };

      // Optimistic update
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

      console.log("✅ Transfer completed successfully");
    } catch (err) {
      console.error("❌ Transfer failed:", err);
      throw new Error("Transfer failed. Try again.");
    }
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
