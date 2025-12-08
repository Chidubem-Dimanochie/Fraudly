import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { User, UserRole } from '../types';

const API_BASE_URL = "http://localhost:8000/api";

interface AuthContextType {
  user: User | null;
  users: User[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncUserFromCognito: () => Promise<void>;
  updateUser: (updatedData: Partial<User>) => void;
  updateUserDetails: (email: string, updatedData: Partial<User>) => void;
  transferFunds: (recipientUsername: string, amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract username from Cognito user attributes
  const extractUsername = async (cognitoUser: any): Promise<string> => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      
      // Try to get preferred_username from token payload
      if (idToken?.payload?.preferred_username) {
        return idToken.payload.preferred_username as string;
      }
      
      // Fallback to Cognito username (which might be email or UUID)
      return cognitoUser.username;
    } catch (e) {
      console.warn("Could not extract username from token, using Cognito username");
      return cognitoUser.username;
    }
  };

  // Generate a username from email if none exists
  const generateUsernameFromEmail = (email: string): string => {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/users`);
        if (!res.ok) throw new Error("Failed to fetch users from backend.");
        const allUsers: User[] = await res.json();
        setUsers(allUsers);

        try {
          const cognitoUser = await getCurrentUser();
          const email = cognitoUser.signInDetails?.loginId || cognitoUser.username;
          
          if (email) {
            await performSync(email, cognitoUser, allUsers);
          }
        } catch (e) {
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

  const performSync = async (email: string, cognitoUser: any, currentUsersList: User[]) => {
    let existingUser = currentUsersList.find(u => u.email === email);

    if (!existingUser) {
      console.log(`User ${email} not found in MongoDB. Creating...`);
      
      // Extract or generate username
      const username = await extractUsername(cognitoUser) || generateUsernameFromEmail(email);
      
      // Determine role
      let role: UserRole = UserRole.Customer;
      if (email === 'admin@company.com') role = UserRole.Admin;
      else if (email.endsWith('@company.com')) role = UserRole.Employee;

      const newUser = {
        username,
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

        if (!createRes.ok) {
          const errorData = await createRes.json();
          throw new Error(errorData.detail || "Failed to create user");
        }
        
        existingUser = await createRes.json();
        setUsers(prev => [...prev, existingUser!]);
      } catch (err: any) {
        console.error("Error creating user:", err);
        throw err;
      }
    }

    if (existingUser?.isBanned) {
      throw new Error("This account has been suspended.");
    }

    setUser(existingUser || null);
  };

  const syncUserFromCognito = async () => {
    setIsLoading(true);
    try {
      const cognitoUser = await getCurrentUser();
      const email = cognitoUser.signInDetails?.loginId || cognitoUser.username;
      
      const res = await fetch(`${API_BASE_URL}/users`);
      const allUsers = await res.json();
      setUsers(allUsers);
      
      await performSync(email, cognitoUser, allUsers);
    } catch (err: any) {
      console.error("Sync failed:", err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

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

  const logout = async () => {
    try {
      await signOut();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error(err);
    }
  };

  const updateUser = async (updatedData: Partial<User>) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/email/${user.email}`, {
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

  const updateUserDetails = async (email: string, updatedData: Partial<User>) => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/email/${email}`, {
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

  const transferFunds = async (recipientUsername: string, amount: number) => {
    if (!user) throw new Error("No user logged in.");
    if (amount <= 0) throw new Error("Amount must be positive.");

    const recipient = users.find(u => u.username === recipientUsername);
    if (!recipient) throw new Error("Recipient not found.");
    if (user.balance < amount) throw new Error("Insufficient funds.");

    try {
      const updatedSender = { ...user, balance: user.balance - amount };
      const updatedRecipient = { ...recipient, balance: recipient.balance + amount };

      setUser(updatedSender);
      setUsers(prev =>
        prev.map(u =>
          u.username === user.username ? updatedSender :
          u.username === recipientUsername ? updatedRecipient : u
        )
      );

      await Promise.all([
        fetch(`${API_BASE_URL}/users/email/${user.email}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: updatedSender.balance }),
        }),
        fetch(`${API_BASE_URL}/users/email/${recipient.email}`, {
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
        ? <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Connecting to secure server...</p>
            </div>
          </div>
        : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};