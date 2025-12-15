import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Transaction, TransactionStatus, User, AuditLog } from '../types';
import AdminDashboard from './AdminDashboard';
import EmployeeDashboard from './EmployeeDashboard';
import CustomerDashboard from './CustomerDashboard';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || /* "http://localhost:8000/api"*/;

const Dashboard: React.FC = () => {
  const { user, users, updateUser, updateUserDetails, transferFunds, logout } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastTransaction, setLastTransaction] = useState<Transaction | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Helper: refresh current user from backend (to update balance after approval)
  const refreshCurrentUser = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE}/users/by-email/${encodeURIComponent(user.email)}`);
      if (!res.ok) return;
      const fresh = await res.json();
      updateUser(fresh);
    } catch (e) {
      console.warn('⚠️ Failed to refresh current user:', e);
    }
  };

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('📥 Fetching dashboard data...');
        const [txnsRes, logsRes] = await Promise.all([
          fetch(`${API_BASE}/transactions`),
          fetch(`${API_BASE}/audit-logs`),
        ]);

        if (!txnsRes.ok || !logsRes.ok) {
          console.error('Failed to fetch:', {
            transactions: txnsRes.status,
            logs: logsRes.status,
          });
          throw new Error('Failed to fetch initial data.');
        }

        const txns = await txnsRes.json();
        const logs = await logsRes.json();

        console.log('✅ Data fetched:', {
          transactions: txns.length,
          logs: logs.length,
        });

        setTransactions(txns);
        setAuditLogs(logs);

        await refreshCurrentUser();
      } catch (e: any) {
        console.error('❌ Data fetch error:', e.message);
        setError(
          'Could not load data from the server. Please ensure the backend is running '
        );
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  // ✅ UPDATED: logout redirects to /login with a "loggedOut" flag
  const handleLogout = async () => {
    // ✅ clear sticky login flags so errors don't persist after a clean logout
    sessionStorage.removeItem("LOGIN_ERROR");
    sessionStorage.removeItem("LOGIN_PENDING");
    sessionStorage.removeItem("LOGIN_PENDING_AT");
    sessionStorage.removeItem("AUTH_LOCKED");
    sessionStorage.removeItem("BANNED_LOOP_ONCE");
  
    await logout();
    navigate("/", { replace: true });
  };
  

  const addAuditLog = async (action: string, details: string) => {
    const newLog = {
      timestamp: new Date().toISOString(),
      actor: user.email,
      action,
      details,
    };

    console.log('Adding audit log:', newLog);

    try {
      const response = await fetch(`${API_BASE}/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLog),
      });

      if (!response.ok) throw new Error('Failed to save audit log');

      const savedLog = await response.json();
      setAuditLogs(prev => [savedLog, ...prev]);
      console.log('✅ Audit log saved');
    } catch (err) {
      console.error('❌ Failed to save audit log:', err);
    }
  };

  const handleAddTransaction = async (
    newTransactionData: Omit<Transaction, 'id' | 'userEmail' | 'status' | 'reason' | 'timestamp'>
  ) => {
    setError(null);

    if (user.isBanned) {
      setError('Transaction declined. Your account is suspended.');
      return;
    }
    if (user.cardFrozen) {
      setError('Transaction declined. Your card is frozen.');
      return;
    }

    setIsLoading(true);
    setLastTransaction(undefined);

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (user.alertThreshold && newTransactionData.amount > user.alertThreshold) {
      alert(
        `ALERT: Transaction of $${newTransactionData.amount.toFixed(
          2
        )} is over your set threshold of $${user.alertThreshold}.`
      );
    }

    const requestPayload = {
      userEmail: user.email,
      amount: newTransactionData.amount,
      merchant: newTransactionData.merchant,
      location: newTransactionData.location,
    };

    console.log('💳 Sending transaction to backend for decision:', requestPayload);

    try {
      const response = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        console.error('❌ Backend returned error status:', response.status);
        throw new Error('Failed to create transaction');
      }

      const savedTransaction: Transaction = await response.json();

      await refreshCurrentUser();

      setTransactions(prev => [savedTransaction, ...prev]);
      setLastTransaction(savedTransaction);
    } catch (err) {
      console.error('Failed to create transaction:', err);
      setError('Failed to process transaction. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (
    transactionId: string,
    newStatus: TransactionStatus,
    note: string
  ) => {
    const originalTransactions = [...transactions];
    let updatedTransaction: Transaction | null = null;

    const newTransactions = transactions.map(t => {
      if (t.id === transactionId) {
        const newNote = { timestamp: new Date().toISOString(), analyst: user.email, note };
        updatedTransaction = {
          ...t,
          status: newStatus,
          analystNotes: [...(t.analystNotes || []), newNote],
        };
        return updatedTransaction;
      }
      return t;
    });

    setTransactions(newTransactions);
    addAuditLog(
      'TRANSACTION_STATUS_UPDATE',
      `Updated transaction ${transactionId} status to ${newStatus}.`
    );

    try {
      if (!updatedTransaction) throw new Error('Could not find transaction to update.');
      const { status, analystNotes } = updatedTransaction;

      const response = await fetch(`${API_BASE}/transactions/${transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, analystNotes }),
      });

      if (!response.ok) throw new Error('Server failed to update transaction.');

      if (newStatus === 'approved') {
        await refreshCurrentUser();
      }
    } catch (err) {
      console.error('Failed to update transaction:', err);
      setTransactions(originalTransactions);
      alert('Error: Could not update transaction status.');
    }
  };

  const handleUserUpdate = async (username: string, data: Partial<User>) => {
    const targetUser = users.find(u => u.username === username);
    if (!targetUser) {
      console.error('User not found:', username);
      throw new Error('User not found');
    }

    if (data.role !== undefined && data.role !== targetUser.role) {
      await addAuditLog(
        'USER_ROLE_CHANGE',
        `Changed ${targetUser.email}'s role from ${targetUser.role} to ${data.role}.`
      );
    }
    if (data.isBanned !== undefined && data.isBanned !== targetUser.isBanned) {
      await addAuditLog(
        'USER_STATUS_CHANGE',
        `${data.isBanned ? 'Banned' : 'Unbanned'} user ${targetUser.email}.`
      );
    }

    await updateUserDetails(username, data);

    if (targetUser.email === user.email) {
      await refreshCurrentUser();
    }
  };

  const renderDashboardContent = () => {
    switch (user.role) {
      case UserRole.Admin:
        return (
          <AdminDashboard
            transactions={transactions}
            auditLogs={auditLogs}
            onStatusUpdate={handleStatusUpdate}
            onUserUpdate={handleUserUpdate}
          />
        );

      case UserRole.Employee:
        return <EmployeeDashboard transactions={transactions} onStatusUpdate={handleStatusUpdate} />;

      case UserRole.Customer: {
        const userTransactions = transactions.filter(t => t.userEmail === user.email);
        return (
          <CustomerDashboard
            user={user}
            transactions={userTransactions}
            onAddTransaction={handleAddTransaction}
            onUpdateUser={updateUser}
            onTransferFunds={transferFunds}
            isLoading={isLoading}
            error={error}
            lastTransaction={lastTransaction?.userEmail === user.email ? lastTransaction : undefined}
          />
        );
      }

      default:
        return <p>Your dashboard is not available.</p>;
    }
  };

  const displayName = user.fullName || user.username;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {user.role} Dashboard
          </h1>

          <div className="flex items-center space-x-4">
            {error && <p className="text-red-500 text-sm hidden sm:block">{error}</p>}

            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{user.email}</div>
            </div>

            <button
              onClick={handleLogout}
              className="py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{renderDashboardContent()}</div>
      </main>
    </div>
  );
};

export default Dashboard;
