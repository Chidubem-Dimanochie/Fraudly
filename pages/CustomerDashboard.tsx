import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, User, TransactionStatus } from '../types';
import { useAuth } from '../context/AuthContext';

// --- Reusable Components ---

const StatusBadge: React.FC<{ status: Transaction['status'] }> = ({ status }) => {
    const statusStyles = {
        approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        fraudulent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        in_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return (
        <span
            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${statusStyles[status]}`}
        >
            {status.replace('_', ' ')}
        </span>
    );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
    active,
    onClick,
    children,
}) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
            active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
    >
        {children}
    </button>
);

// --- Tab Content Components ---

const NewTransactionTab: React.FC<{
    onAddTransaction: (data: Omit<Transaction, 'id' | 'userEmail' | 'status' | 'reason' | 'timestamp'>) => void;
    isLoading: boolean;
    lastTransaction?: Transaction;
    error: string | null;
}> = ({ onAddTransaction, isLoading, lastTransaction, error }) => {
    const [amount, setAmount] = useState('');
    const [merchant, setMerchant] = useState('');
    const [location, setLocation] = useState('');
    const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
    const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
    const [isLocationLoading, setIsLocationLoading] = useState(false);

    const { user } = useAuth();

    const isCardFrozen = user?.cardFrozen;
    const isBanned = user?.isBanned;

    // Live autocomplete using Teleport Cities API directly (frontend-only)
    useEffect(() => {
        const controller = new AbortController();

        const fetchLocations = async () => {
            const query = location.trim();
            if (query.length < 2) {
                setLocationSuggestions([]);
                setShowLocationSuggestions(false);
                return;
            }

            try {
                setIsLocationLoading(true);

                const res = await fetch(
                    `https://api.teleport.org/api/cities/?search=${encodeURIComponent(query)}&limit=8`,
                    { signal: controller.signal }
                );

                if (!res.ok) {
                    console.error('Teleport API error status:', res.status);
                    throw new Error(`Failed to fetch locations: ${res.status}`);
                }

                const data = await res.json();
                const results = data._embedded?.['city:search-results'] ?? [];

                const suggestions: string[] = results
                    .map((r: any) => r?.matching_full_name as string)
                    .filter(Boolean);

                setLocationSuggestions(suggestions);
                setShowLocationSuggestions(suggestions.length > 0);
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('Location autocomplete error:', err);
                }
                setLocationSuggestions([]);
                setShowLocationSuggestions(false);
            } finally {
                setIsLocationLoading(false);
            }
        };

        fetchLocations();

        return () => controller.abort();
    }, [location]);

    const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLocation(value);
        // suggestions handled by useEffect
    };

    const handleLocationSelect = (loc: string) => {
        setLocation(loc);
        setLocationSuggestions([]);
        setShowLocationSuggestions(false);
    };

    const handleLocationBlur = () => {
        // small delay so clicking a suggestion still works
        setTimeout(() => {
            setShowLocationSuggestions(false);
        }, 150);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddTransaction({ amount: parseFloat(amount), merchant, location });
        setAmount('');
        setMerchant('');
        setLocation('');
        setLocationSuggestions([]);
        setShowLocationSuggestions(false);
    };

    return (
        <div>
            <h3 className="text-xl font-bold mb-1 text-gray-800 dark:text-white">Transaction Fraud Check</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
                Enter transaction details to analyze for potential fraud.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="amount"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        Amount ($)
                    </label>
                    <input
                        type="number"
                        id="amount"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="e.g., 49.99"
                        required
                        min="0.01"
                        step="0.01"
                        disabled={isBanned}
                    />
                </div>
                <div>
                    <label
                        htmlFor="merchant"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        Merchant
                    </label>
                    <input
                        type="text"
                        id="merchant"
                        value={merchant}
                        onChange={e => setMerchant(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="e.g., Amazon, Starbucks"
                        required
                        disabled={isBanned}
                    />
                </div>
                <div className="relative">
                    <label
                        htmlFor="location"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        Location
                    </label>
                    <input
                        type="text"
                        id="location"
                        value={location}
                        onChange={handleLocationChange}
                        onFocus={() => {
                            if (locationSuggestions.length > 0) {
                                setShowLocationSuggestions(true);
                            }
                        }}
                        onBlur={handleLocationBlur}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="e.g., New York, NY, USA"
                        required
                        disabled={isBanned}
                    />
                    {showLocationSuggestions && (
                        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700">
                            {isLocationLoading && (
                                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    Searching...
                                </li>
                            )}
                            {!isLocationLoading && locationSuggestions.length === 0 && (
                                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    No popular locations found
                                </li>
                            )}
                            {!isLocationLoading &&
                                locationSuggestions.map(loc => (
                                    <li
                                        key={loc}
                                        onMouseDown={() => handleLocationSelect(loc)}
                                        className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        {loc}
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>
                <button
                    type="submit"
                    disabled={isLoading || isCardFrozen || isBanned}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                >
                    {isBanned
                        ? 'Account Suspended'
                        : isCardFrozen
                        ? 'Card is Frozen'
                        : isLoading
                        ? 'Analyzing...'
                        : 'Check Transaction'}
                </button>
            </form>
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
            {!isLoading && lastTransaction && <ResultDisplay transaction={lastTransaction} />}
        </div>
    );
};

const HistoryTab: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'all'>('all');

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchesSearch =
                t.merchant.toLowerCase().includes(searchTerm.toLowerCase()) ||
                new Date(t.timestamp).toLocaleDateString().includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [transactions, searchTerm, statusFilter]);

    return (
        <div>
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Transaction History</h3>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <input
                    type="text"
                    placeholder="Search by merchant or date..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-grow block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="block w-full sm:w-48 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                    <option value="all">All Statuses</option>
                    <option value="approved">Approved</option>
                    <option value="fraudulent">Fraudulent</option>
                    <option value="in_review">In Review</option>
                </select>
            </div>
            <div className="overflow-x-auto">
                {filteredTransactions.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Merchant
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Amount
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredTransactions.map(t => (
                                <tr key={t.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(t.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {t.merchant}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        ${t.amount.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <StatusBadge status={t.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No transactions match your filters.
                    </p>
                )}
            </div>
        </div>
    );
};

const SettingsTab: React.FC<{
    user: User;
    onUpdateUser: (data: Partial<User>) => void;
    onTransferFunds: (recipientEmail: string, amount: number) => Promise<void>;
}> = ({ user, onUpdateUser, onTransferFunds }) => {
    const [threshold, setThreshold] = useState(user.alertThreshold?.toString() || '');
    const [recipient, setRecipient] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferStatus, setTransferStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
        null
    );

    const handleSetThreshold = () => {
        const value = threshold ? parseFloat(threshold) : null;
        onUpdateUser({ alertThreshold: value });
        alert(`Alert threshold ${value ? `set to $${value}` : 'cleared'}.`);
    };

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        setTransferStatus(null);
        try {
            await onTransferFunds(recipient, parseFloat(transferAmount));
            setTransferStatus({ type: 'success', message: 'Transfer successful!' });
            setRecipient('');
            setTransferAmount('');
        } catch (err: any) {
            setTransferStatus({ type: 'error', message: err.toString() });
        }
    };

    return (
        <div className="space-y-8">
            {/* Profile Section */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-6 text-white">
                <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                        <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-bold">
                            {user.fullName
                                ? user.username
                                      .split(' ')
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map(p => p[0])
                                      .join('')
                                      .toUpperCase()
                                : user.username[0].toUpperCase()}
                        </div>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-2xl font-bold">
                            {user.fullName || user.username}
                        </h3>
                        <p className="text-indigo-100 text-sm mt-1">{user.email}</p>
                        <p className="text-indigo-100 text-xs mt-1">@{user.username}</p>
                    </div>
                </div>
            </div>

            {/* Account Summary */}
            <div>
                <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Account Summary</h3>
                <p className="text-4xl font-bold text-gray-900 dark:text-white">
                    $
                    {user.balance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </p>
                <p className="text-gray-500 dark:text-gray-400">Available Balance</p>
            </div>

            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Card Controls</h3>
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                            Freeze Card
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={user.cardFrozen}
                                onChange={e => onUpdateUser({ cardFrozen: e.target.checked })}
                                className="sr-only peer"
                                disabled={user.isBanned}
                            />
                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>
                    {user.cardFrozen && (
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                            Your card is frozen. All transactions will be declined.
                        </p>
                    )}
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-white">
                        Custom Alerts
                    </h3>
                    <div className="flex items-center gap-4">
                        <input
                            type="number"
                            value={threshold}
                            onChange={e => setThreshold(e.target.value)}
                            placeholder="e.g., 500"
                            className="flex-grow block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            disabled={user.isBanned}
                        />
                        <button
                            onClick={handleSetThreshold}
                            className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                            disabled={user.isBanned}
                        >
                            Set Threshold
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Leave blank to disable. You'll get an alert for any transaction over this amount.
                    </p>
                </div>
            </div>

            <div>
                <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Transfer Funds</h3>
                <form onSubmit={handleTransfer} className="space-y-4">
                    <div>
                        <label
                            htmlFor="recipient"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                            Recipient's Email
                        </label>
                        <input
                            type="email"
                            id="recipient"
                            value={recipient}
                            onChange={e => setRecipient(e.target.value)}
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            disabled={user.isBanned}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="transfer-amount"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                            Amount ($)
                        </label>
                        <input
                            type="number"
                            id="transfer-amount"
                            value={transferAmount}
                            onChange={e => setTransferAmount(e.target.value)}
                            required
                            min="0.01"
                            step="0.01"
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            disabled={user.isBanned}
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                        disabled={user.isBanned}
                    >
                        Send Money
                    </button>
                </form>
                {transferStatus && (
                    <p
                        className={`mt-2 text-sm ${
                            transferStatus.type === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                        {transferStatus.message}
                    </p>
                )}
            </div>
        </div>
    );
};

const ResultDisplay: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
    const isFraudulent = transaction.status === 'fraudulent';
    const statusColor = isFraudulent ? 'text-red-500' : 'text-green-500';
    const bgColor = isFraudulent ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
    const borderColor = isFraudulent ? 'border-red-500' : 'border-green-500';
    const Icon = isFraudulent ? (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
        </svg>
    ) : (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        </svg>
    );
    return (
        <div className={`border-l-4 ${borderColor} ${bgColor} p-4 mt-6 rounded-md`}>
            <div className="flex">
                <div className="flex-shrink-0">{Icon}</div>
                <div className="ml-3">
                    <p className={`text-sm font-bold ${statusColor} capitalize`}>
                        {transaction.status.replace('_', ' ')}
                    </p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {transaction.reason}
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Main Dashboard Component ---

interface CustomerDashboardProps {
    user: User;
    transactions: Transaction[];
    onAddTransaction: (
        transaction: Omit<Transaction, 'id' | 'userEmail' | 'status' | 'reason' | 'timestamp'>
    ) => void;
    onUpdateUser: (data: Partial<User>) => void;
    onTransferFunds: (recipientEmail: string, amount: number) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    lastTransaction: Transaction | undefined;
}

const CustomerDashboard: React.FC<CustomerDashboardProps> = props => {
    const [activeTab, setActiveTab] = useState<'new' | 'history' | 'settings'>('new');
    const { user, transactions, onAddTransaction, onUpdateUser, onTransferFunds, isLoading, error, lastTransaction } =
        props;

    return (
        <div className="max-w-4xl mx-auto">
            {user.isBanned && (
                <div
                    className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md"
                    role="alert"
                >
                    <p className="font-bold">Account Suspended</p>
                    <p>Your account is currently suspended. Please contact support for assistance.</p>
                </div>
            )}
            <div className="mb-6">
                <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <TabButton active={activeTab === 'new'} onClick={() => setActiveTab('new')}>
                        New Transaction
                    </TabButton>
                    <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
                        History
                    </TabButton>
                    <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
                        Account & Settings
                    </TabButton>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 sm:p-8">
                {activeTab === 'new' && (
                    <NewTransactionTab
                        onAddTransaction={onAddTransaction}
                        isLoading={isLoading}
                        error={error}
                        lastTransaction={lastTransaction}
                    />
                )}
                {activeTab === 'history' && <HistoryTab transactions={transactions} />}
                {activeTab === 'settings' && (
                    <SettingsTab user={user} onUpdateUser={onUpdateUser} onTransferFunds={onTransferFunds} />
                )}
            </div>
        </div>
    );
};

export default CustomerDashboard;
