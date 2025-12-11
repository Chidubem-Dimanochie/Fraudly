import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Transaction, TransactionStatus, User, AuditLog, FraudRule } from '../types';
import AdminDashboard from './AdminDashboard';
import EmployeeDashboard from './EmployeeDashboard';
import CustomerDashboard from './CustomerDashboard';
import { useNavigate } from 'react-router-dom';

// Use a consistent API base. Ideally imported from a config file.
const API_BASE = 'http://localhost:8000/api';

const Dashboard: React.FC = () => {
  // ✅ Call useAuth ONLY at the top level
  const { user, users, updateUser, updateUserDetails, transferFunds, logout } = useAuth();
  const navigate = useNavigate();
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
            console.log('📥 Fetching dashboard data...');
            const [txnsRes, rulesRes, logsRes] = await Promise.all([
                fetch(`${API_BASE}/transactions`),
                fetch(`${API_BASE}/fraud-rules`),  // ✅ uses new endpoint
                fetch(`${API_BASE}/audit-logs`),   // ✅ uses new endpoint
            ]);
            
            if (!txnsRes.ok || !rulesRes.ok || !logsRes.ok) {
                console.error('❌ Failed to fetch:', {
                    transactions: txnsRes.status,
                    rules: rulesRes.status,
                    logs: logsRes.status
                });
                throw new Error('Failed to fetch initial data.');
            }
            
            const txns = await txnsRes.json();
            const rules = await rulesRes.json();
            const logs = await logsRes.json();

            console.log('✅ Data fetched:', {
                transactions: txns.length,
                rules: rules.length,
                logs: logs.length
            });

            setTransactions(txns);
            setFraudRules(rules);
            setAuditLogs(logs);

        } catch (e: any) {
            console.error("❌ Data fetch error:", e.message);
            setError("Could not load data from the server. Please ensure the backend is running at http://localhost:8000");
        }
    };
    fetchData();
  }, []);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };
  
  const addAuditLog = async (action: string, details: string) => {
    const newLog = {
        timestamp: new Date().toISOString(),
        actor: user.email,
        action,
        details
    };
    
    console.log('📝 Adding audit log:', newLog);
    
    // Persist to DB first to get the ID
    try {
        const response = await fetch(`${API_BASE}/audit-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLog),
        });
        
        if (!response.ok) {
            throw new Error('Failed to save audit log');
        }
        
        const savedLog = await response.json();
        // Update UI with the log that includes the server-generated ID
        setAuditLogs(prev => [savedLog, ...prev]);
        console.log('✅ Audit log saved');
    } catch (err) {
        console.error("❌ Failed to save audit log:", err);
    }
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

    const newTransactionPayload = {
      ...newTransactionData,
      userEmail: user.email,
      status,
      reason,
      timestamp: new Date().toISOString(),
      analystNotes: [],
    };
    
    console.log('💳 Creating transaction:', newTransactionPayload);
    
    try {
        // Persist transaction to DB
        const response = await fetch(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTransactionPayload),
        });
        
        if (!response.ok) {
            throw new Error('Failed to create transaction');
        }
        
        const savedTransaction = await response.json();
        console.log('✅ Transaction created:', savedTransaction.id);
        
        // Update user balance if transaction is not fraudulent
        if (status !== 'fraudulent') {
            updateUser({ balance: user.balance - newTransactionData.amount });
        }

        // Update UI with saved transaction (includes server-generated ID)
        setTransactions(prev => [savedTransaction, ...prev]);
        setLastTransaction(savedTransaction);
    } catch (err) {
        console.error('❌ Failed to create transaction:', err);
        setError('Failed to process transaction. Please try again.');
    } finally {
        setIsLoading(false);
    }
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
          
          console.log('🔄 Updating transaction:', transactionId);
          
          const response = await fetch(`${API_BASE}/transactions/${transactionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, analystNotes }),
          });
          
          if (!response.ok) throw new Error("Server failed to update transaction.");
          
          console.log('✅ Transaction updated');
      } catch (err) {
          console.error("❌ Failed to update transaction:", err);
          // Revert UI on failure
          setTransactions(originalTransactions);
          alert("Error: Could not update transaction status.");
      }
  };

  const handleUserUpdate = async (username: string, data: Partial<User>) => {
      // Find the user to get their original state for logging
      const targetUser = users.find(u => u.username === username);
      if (!targetUser) {
          console.error("User not found:", username);
          throw new Error("User not found");
      }
      
      console.log('👤 Updating user:', username, data);
      
      // Log changes
      if (data.role !== undefined && data.role !== targetUser.role) {
        await addAuditLog(
            "USER_ROLE_CHANGE",
            `Changed ${targetUser.email}'s role from ${targetUser.role} to ${data.role}.`
        );
    }
      if (data.isBanned !== undefined && data.isBanned !== targetUser.isBanned) {
          await addAuditLog('USER_STATUS_CHANGE', `${data.isBanned ? 'Banned' : 'Unbanned'} user ${targetUser.email}.`);
      }
      
      // This function from AuthContext handles the API call and UI update
      await updateUserDetails(username, data);
      console.log('✅ User updated');
  };

  const handleRuleAdd = async (rule: Omit<FraudRule, 'id'>) => {
      console.log('➕ Adding fraud rule:', rule);
      
      try {
          // Persist to DB first to get server-generated ID
          const response = await fetch(`${API_BASE}/fraud-rules`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(rule)
          });
          
          if (!response.ok) {
              throw new Error('Failed to create fraud rule');
          }
          
          const newRule = await response.json();
          console.log('✅ Fraud rule created:', newRule.id);
          
          // Update UI with saved rule
          setFraudRules(prev => [...prev, newRule]);
          addAuditLog('FRAUD_RULE_ADD', `Added new rule: ${newRule.description}`);
      } catch (err) {
          console.error('❌ Failed to add fraud rule:', err);
          alert('Failed to add fraud rule. Please try again.');
      }
  };

  const handleRuleDelete = async (ruleId: string) => {
      const ruleToDelete = fraudRules.find(r => r.id === ruleId);
      if (ruleToDelete) {
        console.log('🗑️ Deleting fraud rule:', ruleId);
        
        try {
            // Persist to DB
            const response = await fetch(`${API_BASE}/fraud-rules/${ruleId}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete fraud rule');
            }
            
            console.log('✅ Fraud rule deleted');
            
            // Update UI
            setFraudRules(prev => prev.filter(r => r.id !== ruleId));
            addAuditLog('FRAUD_RULE_DELETE', `Deleted rule: ${ruleToDelete.description}`);
        } catch (err) {
            console.error('❌ Failed to delete fraud rule:', err);
            alert('Failed to delete fraud rule. Please try again.');
        }
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
            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {/* 👇 Use fullName if present, otherwise fall back to username */}
                {user.fullName || user.username}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {user.email}
              </div>
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
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {renderDashboardContent()}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
