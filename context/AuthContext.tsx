import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { signIn, signOut, getCurrentUser } from 'aws-amplify/auth';
import { User, UserRole } from '../types';

// -------------------------
// API base URL
// -------------------------
// This points to the FastAPI backend. 
// All requests will be prefixed with this URL.
const API_BASE_URL = "http://localhost:8000/api";

// -------------------------
interface AuthContextType {
  user: User | null;
  users: User[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncUserFromCognito: () => Promise<void>; // Changed signature to not require email arg, it gets it internally
  updateUser: (updatedData: Partial<User>) => void;
  updateUserDetails: (email: string, updatedData: Partial<User>) => void;
  transferFunds: (recipientEmail: string, amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// -------------------------
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -------------------------
  // INITIAL LOAD
  // -------------------------
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        // 1. Check if backend is alive and get users
        const res = await fetch(`${API_BASE_URL}/users`);
        if (!res.ok) throw new Error("Failed to fetch users from backend.");
        const allUsers: User[] = await res.json();
        setUsers(allUsers);

        // 2. Check if a Cognito session exists
        try {
          const cognitoUser = await getCurrentUser();
          const email = cognitoUser.signInDetails?.loginId || cognitoUser.username;
          
          if (email) {
            // 3. If Cognito session exists, sync with MongoDB
            await performSync(email, allUsers);
          }
        } catch (e) {
          // No user signed in, that's fine.
          console.log("No active session found.");
        }
      } catch (e: any) {
        setError("Could not connect to the backend server. Is it running on port 8000?");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // -------------------------
  // HELPER: Core Sync Logic
  // -------------------------
  const performSync = async (email: string, currentUsersList: User[]) => {
    let existingUser = currentUsersList.find(u => u.email === email);

    if (!existingUser) {
      console.log(`User ${email} not found in MongoDB. Creating...`);
      
      // Determine role based on email pattern
      let role: UserRole = UserRole.Customer;
      if (email === 'admin@company.com') role = UserRole.Admin;
      else if (email.endsWith('@company.com')) role = UserRole.Employee;

      const newUser: Omit<User, 'id'> = {
        email,
        role,
        balance: 10000,
        cardFrozen: false,
        alertThreshold: null,
        isBanned: false,
      };

      try {
        const createRes = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser),
        });

        if (!createRes.ok) throw new Error("Failed to create new user in MongoDB.");
        
        existingUser = await createRes.json();
        // Update local state
        setUsers(prev => [...prev, existingUser!]);
      } catch (err) {
        console.error("Error creating user:", err);
        throw err;
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
      const cognitoUser = await getCurrentUser();
      const email = cognitoUser.signInDetails?.loginId || cognitoUser.username;
      
      // Refresh users list to ensure we have latest
      const res = await fetch(`${API_BASE_URL}/users`);
      const allUsers = await res.json();
      setUsers(allUsers);
      
      await performSync(email, allUsers);
    } catch (err: any) {
      console.error("Sync failed:", err);
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
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------
  // UPDATE LOGGED-IN USER
  // -------------------------
  const updateUser = async (updatedData: Partial<User>) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/${user.email}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error("Failed to update user.");
      const updatedUser: User = await res.json();
      setUser(updatedUser);
      setUsers(prev => prev.map(u => (u.email === user.email ? updatedUser : u)));
    } catch (e) {
      console.error(e);
      alert("Error updating user details.");
    }
  };

  // -------------------------
  // ADMIN UPDATE ANY USER
  // -------------------------
  const updateUserDetails = async (email: string, updatedData: Partial<User>) => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${email}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error("Failed to update user.");
      const updatedUser: User = await res.json();
      setUsers(prev => prev.map(u => (u.email === email ? updatedUser : u)));
    } catch (e) {
      console.error(e);
      alert("Error updating user details.");
    }
  };

  // -------------------------
  // TRANSFER FUNDS
  // -------------------------
  const transferFunds = async (recipientEmail: string, amount: number) => {
    if (!user) throw new Error("No user logged in.");
    if (amount <= 0) throw new Error("Amount must be positive.");

    const recipient = users.find(u => u.email === recipientEmail);
    if (!recipient) throw new Error("Recipient not found.");
    if (user.balance < amount) throw new Error("Insufficient funds.");

    try {
      const updatedSender = { ...user, balance: user.balance - amount };
      const updatedRecipient = { ...recipient, balance: recipient.balance + amount };

      setUser(updatedSender);
      setUsers(prev =>
        prev.map(u =>
          u.email === user.email ? updatedSender :
          u.email === recipientEmail ? updatedRecipient : u
        )
      );

      await Promise.all([
        fetch(`${API_BASE_URL}/users/${user.email}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: updatedSender.balance }),
        }),
        fetch(`${API_BASE_URL}/users/${recipientEmail}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: updatedRecipient.balance }),
        })
      ]);
    } catch (err) {
      throw new Error("Transfer failed. Try again.");
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      users,
      isLoading,
      error,
      login,
      logout,
      syncUserFromCognito,
      updateUser,
      updateUserDetails,
      transferFunds
    }}>
      {isLoading
        ? <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p className="text-gray-600">Connecting to secure server...</p></div></div>
        : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};