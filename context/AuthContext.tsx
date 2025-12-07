import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { User, UserRole } from '../types';

// -------------------------
// API base URL
// -------------------------
const API_URL = "http://localhost:8000/api"; 
// IMPORTANT: Do NOT add another /api in requests

// -------------------------
interface AuthContextType {
  user: User | null;
  users: User[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updatedData: Partial<User>) => void;
  updateUserDetails: (email: string, updatedData: Partial<User>) => void;
  transferFunds: (recipientEmail: string, amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const CURRENT_USER_EMAIL_KEY = 'current_user_email';

// -------------------------
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -------------------------
  // INITIAL LOAD – fetch all users + restore logged-in state
  // -------------------------
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_URL}/users`);
        if (!res.ok) throw new Error("Failed to fetch users.");
        const allUsers: User[] = await res.json();
        setUsers(allUsers);

        const savedEmail = localStorage.getItem(CURRENT_USER_EMAIL_KEY);
        if (savedEmail) {
          const currentUser = allUsers.find(u => u.email === savedEmail);
          if (currentUser && !currentUser.isBanned) {
            setUser(currentUser);
          } else {
            localStorage.removeItem(CURRENT_USER_EMAIL_KEY);
          }
        }
      } catch (e) {
        setError("Could not connect to the server. Please ensure the backend is running.");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // -------------------------
  // LOGIN
  // -------------------------
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    if (password !== 'password' && process.env.NODE_ENV === 'production') {
      setError("Invalid email or password.");
      setIsLoading(false);
      return;
    }

    try {
      let existingUser = users.find(u => u.email === email);

      // CREATE NEW USER IF NOT EXIST
      if (!existingUser) {
        let role: UserRole;
        if (email === 'admin@company.com') role = UserRole.Admin;
        else if (email.endsWith('@company.com')) role = UserRole.Employee;
        else role = UserRole.Customer;

        const newUser: Omit<User, 'id'> = {
          email,
          role,
          balance: 10000,
          cardFrozen: false,
          alertThreshold: null,
          isBanned: false,
        };

        const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser),
        });

        if (!res.ok) throw new Error("Failed to create new user.");

        existingUser = await res.json();
        setUsers(prev => [...prev, existingUser]);
      }

      if (existingUser.isBanned) {
        throw new Error("This account has been suspended.");
      }

      setUser(existingUser);
      localStorage.setItem(CURRENT_USER_EMAIL_KEY, email);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  const logout = () => {
    localStorage.removeItem(CURRENT_USER_EMAIL_KEY);
    setUser(null);
    setError(null);
  };

  // -------------------------
  // UPDATE LOGGED-IN USER
  // -------------------------
  const updateUser = async (updatedData: Partial<User>) => {
    if (!user) return;

    try {
      const res = await fetch(`${API_URL}/users/${user.email}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (!res.ok) throw new Error("Failed to update user.");

      const updatedUser: User = await res.json();
      setUser(updatedUser);

      setUsers(prev =>
        prev.map(u => (u.email === user.email ? updatedUser : u))
      );
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
      const res = await fetch(`${API_URL}/users/${email}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (!res.ok) throw new Error("Failed to update user.");

      const updatedUser: User = await res.json();

      setUsers(prev =>
        prev.map(u => (u.email === email ? updatedUser : u))
      );
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
        fetch(`${API_URL}/users/${user.email}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: updatedSender.balance }),
        }),
        fetch(`${API_URL}/users/${recipientEmail}`, {
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
      updateUser,
      updateUserDetails,
      transferFunds
    }}>
      {isLoading
        ? <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>
        : children}
    </AuthContext.Provider>
  );
};

// -------------------------
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
