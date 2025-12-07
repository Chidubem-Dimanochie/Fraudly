import React, { useState, useMemo } from 'react';
import { Transaction, TransactionStatus, User } from '../types';

const StatusBadge: React.FC<{ status: Transaction['status'] }> = ({ status }) => {
    const statusStyles = {
        approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        fraudulent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        in_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${statusStyles[status]}`}>
            {status.replace('_', ' ')}
        </span>
    );
};

// --- Case Management Modal ---
const CaseViewModal: React.FC<{
    transaction: Transaction;
    userTransactions: Transaction[];
    onClose: () => void;
    onStatusUpdate: (transactionId: string, newStatus: TransactionStatus, note: string) => void;
}> = ({ transaction, userTransactions, onClose, onStatusUpdate }) => {
    const [note, setNote] = useState('');
    const [action, setAction] = useState<'approve' | 'flag' | null>(null);

    const handleAction = () => {
        if (!action || !note) {
            alert("Please provide a justification note.");
            return;
        }
        const newStatus = action === 'approve' ? 'approved' : 'fraudulent';
        onStatusUpdate(transaction.id, newStatus, note);
        onClose();
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b dark:border-gray-700">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Case Details</h3>
                            <p className="text-sm font-mono text-gray-500 dark:text-gray-400">{transaction.id}</p>
                        </div>
                         <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">&times;</button>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Transaction Details */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Transaction Info</h4>
                        <p><strong>User:</strong> {transaction.userEmail}</p>
                        <p><strong>Amount:</strong> <span className="font-bold text-lg">${transaction.amount.toFixed(2)}</span></p>
                        <p><strong>Merchant:</strong> {transaction.merchant}</p>
                        <p><strong>Location:</strong> {transaction.location}</p>
                        <p><strong>Timestamp:</strong> {new Date(transaction.timestamp).toLocaleString()}</p>
                        <p><strong>Status:</strong> <StatusBadge status={transaction.status} /></p>
                        <p><strong>Reason Flagged:</strong> {transaction.reason}</p>
                    </div>
                     {/* Analyst Actions */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Analyst Actions</h4>
                        <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Add justification note..." className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"></textarea>
                        <div className="flex gap-4">
                             <button onClick={() => {setAction('approve'); handleAction();}} disabled={!note} className="flex-1 py-2 px-4 rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300">Approve</button>
                             <button onClick={() => {setAction('flag'); handleAction();}} disabled={!note} className="flex-1 py-2 px-4 rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300">Flag as Fraud</button>
                        </div>
                         {/* Analyst Notes Log */}
                        <div>
                           <h5 className="font-semibold mt-4 mb-2">Case Log</h5>
                            <div className="space-y-2 text-sm max-h-32 overflow-y-auto">
                               {transaction.analystNotes?.length ? transaction.analystNotes.map((n, i) => (
                                   <div key={i} className="bg-gray-100 dark:bg-gray-700/50 p-2 rounded">
                                       <p className="font-mono text-xs">{new Date(n.timestamp).toLocaleString()} - {n.analyst}</p>
                                       <p>{n.note}</p>
                                   </div>
                               )) : <p className="text-gray-500">No notes yet.</p>}
                           </div>
                        </div>
                    </div>
                </div>
                
                 <div className="p-6 border-t dark:border-gray-700">
                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">User's Recent Transactions</h4>
                    <div className="overflow-y-auto max-h-64">
                    <table className="min-w-full text-sm">
                        <thead className="text-left bg-gray-50 dark:bg-gray-900/50"><tr><th className="p-2">Date</th><th className="p-2">Merchant</th><th className="p-2">Amount</th><th className="p-2">Status</th></tr></thead>
                        <tbody>
                            {userTransactions.map(t => (
                            <tr key={t.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{new Date(t.timestamp).toLocaleDateString()}</td>
                                <td className="p-2">{t.merchant}</td>
                                <td className="p-2">${t.amount.toFixed(2)}</td>
                                <td className="p-2"><StatusBadge status={t.status} /></td>
                            </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Main Component ---
interface EmployeeDashboardProps {
    transactions: Transaction[];
    onStatusUpdate: (transactionId: string, newStatus: TransactionStatus, note: string) => void;
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ transactions, onStatusUpdate }) => {
    const [filters, setFilters] = useState({ userEmail: '', merchant: '', location: '', minAmount: '', maxAmount: '' });
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filters.userEmail && !t.userEmail.toLowerCase().includes(filters.userEmail.toLowerCase())) return false;
            if (filters.merchant && !t.merchant.toLowerCase().includes(filters.merchant.toLowerCase())) return false;
            if (filters.location && !t.location.toLowerCase().includes(filters.location.toLowerCase())) return false;
            if (filters.minAmount && t.amount < parseFloat(filters.minAmount)) return false;
            if (filters.maxAmount && t.amount > parseFloat(filters.maxAmount)) return false;
            return true;
        });
    }, [transactions, filters]);

    const openCaseView = (transaction: Transaction) => {
        setSelectedTxn(transaction);
    };

    return (
        <div className="max-w-7xl mx-auto">
             <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">Transaction Monitoring</h2>
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 sm:p-6">
                {/* Filter Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                    <input type="text" name="userEmail" placeholder="User Email" value={filters.userEmail} onChange={handleFilterChange} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <input type="text" name="merchant" placeholder="Merchant" value={filters.merchant} onChange={handleFilterChange} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <input type="text" name="location" placeholder="Location" value={filters.location} onChange={handleFilterChange} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <input type="number" name="minAmount" placeholder="Min Amount" value={filters.minAmount} onChange={handleFilterChange} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <input type="number" name="maxAmount" placeholder="Max Amount" value={filters.maxAmount} onChange={handleFilterChange} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                </div>

                {/* Transaction List */}
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900/50">
                                    <tr>
                                        <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6">Transaction ID</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold">User</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold">Amount</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold">Merchant</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold">Status</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                    {filteredTransactions.map((transaction) => (
                                        <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="py-4 pl-4 pr-3 text-sm">
                                                <button onClick={() => openCaseView(transaction)} className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline">{transaction.id}</button>
                                            </td>
                                            <td className="px-3 py-4 text-sm truncate max-w-[15ch]">{transaction.userEmail}</td>
                                            <td className="px-3 py-4 text-sm font-medium">${transaction.amount.toFixed(2)}</td>
                                            <td className="px-3 py-4 text-sm">{transaction.merchant}</td>
                                            <td className="px-3 py-4 text-sm"><StatusBadge status={transaction.status} /></td>
                                            <td className="px-3 py-4 text-sm max-w-xs truncate" title={transaction.reason}>{transaction.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            {selectedTxn && (
                <CaseViewModal
                    transaction={selectedTxn}
                    userTransactions={transactions.filter(t => t.userEmail === selectedTxn.userEmail)}
                    onClose={() => setSelectedTxn(null)}
                    onStatusUpdate={onStatusUpdate}
                />
            )}
        </div>
    );
};

export default EmployeeDashboard;