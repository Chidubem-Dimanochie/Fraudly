import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Transaction, TransactionStatus, User, AuditLog, FraudRule } from '../types';
import AdminDashboard from './AdminDashboard';
import EmployeeDashboard from './EmployeeDashboard';
import CustomerDashboard from './CustomerDashboard';

const API_URL = 'http://localhost:8000';

const Dashboard: React.FC = () => {
  const { user, updateUser, updateUserDetails, transferFunds } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastTransaction, setLastTransaction] = useState<Transaction | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [fraudRules, setFraudRules] = useState<FraudRule[]>([]);
  
  // Fetch initial data from the backend when the component mounts
  useEffect(() => {
    const fetchData = async () => {
        try {
            const [txnsRes, rulesRes, logsRes] = await Promise.all([
                fetch(`${API_URL}/api/transactions`),
                fetch(`${API_URL}/api/rules`),
                fetch(`${API_URL}/api/logs`),
            ]);
            if (!txnsRes.ok || !rulesRes.ok || !logsRes.ok) {
                throw new Error('Failed to fetch initial data.');
            }
            const txns = await txnsRes.json();
            const rules = await rulesRes.json();
            const logs = await logsRes.json();

            setTransactions(txns);
            setFraudRules(rules);
            setAuditLogs(logs);

        } catch (e: any) {
            console.error("Data fetch error:", e.message);
            //setError("Could not load data from the server. Please ensure the backend is running.");
        }
    };
    fetchData();
  }, []);

  if (!user) return null;
  
  const addAuditLog = async (action: string, details: string) => {
    const newLog: Omit<AuditLog, 'id'> & { id: string } = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: user.email,
        action,
        details
    };
    // Update UI immediately
    setAuditLogs(prev => [newLog, ...prev]);
    // Persist to DB
    await fetch(`${API_URL}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLog),
    });
  };

  const handleAddTransaction = async (newTransactionData: Omit<Transaction, 'id' | 'userEmail'| 'status' | 'reason' | 'timestamp'>) => {
    setError(null);

    if (user.isBanned) {
        setError("Transaction declined. Your account is suspended.");
        return;
    }
    if (user.cardFrozen) {
      setError("Transaction declined. Your card is frozen.");
      return;
    }
    if (user.balance < newTransactionData.amount) {
      setError("Transaction declined. Insufficient funds.");
      return;
    }

    setIsLoading(true);
    setLastTransaction(undefined);

    // Simulate local processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    let status: TransactionStatus = 'approved';
    let reason = 'Transaction appears normal.';

    // Dynamic Fraud Rule Engine
    for (const rule of fraudRules.sort((a,b) => (b.threshold || 0) - (a.threshold || 0))) {
        let ruleTriggered = false;
        if (rule.type === 'amount' && rule.threshold && newTransactionData.amount > rule.threshold) {
            ruleTriggered = true;
        } else if (rule.type === 'merchantKeyword' && rule.keyword && newTransactionData.merchant.toLowerCase().includes(rule.keyword.toLowerCase())) {
            ruleTriggered = true;
        }

        if (ruleTriggered) {
            status = rule.result as TransactionStatus;
            reason = `Flagged by rule: ${rule.description}.`;
            break;
        }
    }

    if (user.alertThreshold && newTransactionData.amount > user.alertThreshold) {
        alert(`ALERT: Transaction of $${newTransactionData.amount.toFixed(2)} is over your set threshold of $${user.alertThreshold}.`);
    }

    const newTransaction: Transaction & { id: string } = {
      ...newTransactionData,
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userEmail: user.email,
      status,
      reason,
      timestamp: new Date().toISOString(),
      analystNotes: [],
    };
    
    // Update user balance if transaction is not fraudulent
    if (status !== 'fraudulent') {
        updateUser({ balance: user.balance - newTransactionData.amount });
    }

    // Update UI immediately
    setTransactions(prev => [newTransaction, ...prev]);
    setLastTransaction(newTransaction);
    
    // Persist transaction to DB
    await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTransaction),
    });

    setIsLoading(false);
  };

  const handleStatusUpdate = async (transactionId: string, newStatus: TransactionStatus, note: string) => {
      const originalTransactions = [...transactions];
      let updatedTransaction: Transaction | null = null;
      
      const newTransactions = transactions.map(t => {
          if (t.id === transactionId) {
              const newNote = { timestamp: new Date().toISOString(), analyst: user.email, note };
              updatedTransaction = {
                  ...t,
                  status: newStatus,
                  analystNotes: [...(t.analystNotes || []), newNote]
              };
              return updatedTransaction;
          }
          return t;
      });

      // Update UI immediately
      setTransactions(newTransactions);
      addAuditLog('TRANSACTION_STATUS_UPDATE', `Updated transaction ${transactionId} status to ${newStatus}.`);

      // Persist to DB
      try {
          if (!updatedTransaction) throw new Error("Could not find transaction to update.");
          const { status, analystNotes } = updatedTransaction;
          const response = await fetch(`${API_URL}/api/transactions/${transactionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, analystNotes }),
          });
          if (!response.ok) throw new Error("Server failed to update transaction.");
      } catch (err) {
          console.error("Failed to update transaction:", err);
          // Revert UI on failure
          setTransactions(originalTransactions);
          alert("Error: Could not update transaction status.");
      }
  };

  const handleUserUpdate = (email: string, data: Partial<User>) => {
      // Find the user to get their original state for logging
      const targetUser = useAuth().users.find(u => u.email === email);
      if (!targetUser) return;
      if (data.role && data.role !== targetUser.role) {
          addAuditLog('USER_ROLE_CHANGE', `Changed ${email}'s role from ${targetUser.role} to ${data.role}.`);
      }
      if (data.isBanned !== undefined && data.isBanned !== targetUser.isBanned) {
          addAuditLog('USER_STATUS_CHANGE', `${data.isBanned ? 'Banned' : 'Unbanned'} user ${email}.`);
      }
      // This function from AuthContext handles the API call and UI update
      updateUserDetails(email, data);
  };

  const handleRuleAdd = async (rule: Omit<FraudRule, 'id'>) => {
      const newRule = { ...rule, id: `rule_${Date.now()}`};
      // Update UI immediately
      setFraudRules(prev => [...prev, newRule]);
      addAuditLog('FRAUD_RULE_ADD', `Added new rule: ${newRule.description}`);
      // Persist to DB
      await fetch(`${API_URL}/api/rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRule)
      });
  };

  const handleRuleDelete = async (ruleId: string) => {
      const ruleToDelete = fraudRules.find(r => r.id === ruleId);
      if (ruleToDelete) {
        // Update UI immediately
        setFraudRules(prev => prev.filter(r => r.id !== ruleId));
        addAuditLog('FRAUD_RULE_DELETE', `Deleted rule: ${ruleToDelete.description}`);
        // Persist to DB
        await fetch(`${API_URL}/api/rules/${ruleId}`, { method: 'DELETE' });
      }
  };

  const renderDashboardContent = () => {
    switch (user.role) {
      case UserRole.Admin:
        return <AdminDashboard 
                    transactions={transactions} 
                    auditLogs={auditLogs}
                    fraudRules={fraudRules}
                    onStatusUpdate={handleStatusUpdate}
                    onUserUpdate={handleUserUpdate}
                    onRuleAdd={handleRuleAdd}
                    onRuleDelete={handleRuleDelete}
                />;
      case UserRole.Employee:
        return <EmployeeDashboard transactions={transactions} onStatusUpdate={handleStatusUpdate} />;
      case UserRole.Customer:
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
      default:
        return <p>Your dashboard is not available.</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {user.role} Dashboard
          </h1>
          <div className="flex items-center space-x-4">
             {error && <p className="text-red-500 text-sm hidden sm:block">{error}</p>}
            <span className="hidden sm:inline text-gray-600 dark:text-gray-300">
              {user.email}
            </span>
            <button
              onClick={useAuth().logout}
              className="py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {renderDashboardContent()}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
