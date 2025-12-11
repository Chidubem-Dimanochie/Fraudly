import React, { useMemo, useState } from 'react';
import {
    Transaction,
    User,
    UserRole,
    AuditLog,
    FraudRule,
    FraudRuleType,
} from '../types';
import { useAuth } from '../context/AuthContext';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
} from 'recharts';
import EmployeeDashboard from './EmployeeDashboard';

// -----------------------------
// Shared UI Pieces
// -----------------------------

const TabButton: React.FC<{
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition ${
            active
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
    >
        {children}
    </button>
);

const StatCard: React.FC<{
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ReactNode;
    color: string;
}> = ({ title, value, subtitle, icon, color }) => (
    <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-l-4 hover:shadow-lg transition-shadow"
        style={{ borderLeftColor: color }}
    >
        <div className="flex items-center justify-between">
            <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {title}
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {value}
                </p>
                {subtitle && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {subtitle}
                    </p>
                )}
            </div>
            <div
                className="p-3 rounded-full"
                style={{ backgroundColor: `${color}20` }}
            >
                {icon}
            </div>
        </div>
    </div>
);

const TransactionStatusChart: React.FC<{
    data: { name: string; value: number }[];
}> = ({ data }) => {
    const COLORS = ['#10B981', '#EF4444', '#F59E0B']; // Green, Red, Yellow

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Transaction Status Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                        }
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1F2937',
                            border: 'none',
                            color: '#FFF',
                        }}
                    />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

const FraudByLocationChart: React.FC<{
    data: { location: string; count: number }[];
}> = ({ data }) => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Top 5 Fraudulent Locations
            </h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart
                    data={data}
                    margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="location" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1F2937',
                            border: 'none',
                            color: '#FFF',
                        }}
                    />
                    <Legend />
                    <Bar
                        dataKey="count"
                        fill="#EF4444"
                        name="Fraudulent Transactions"
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// -----------------------------
// Overview Tab
// -----------------------------

const OverviewTab: React.FC<{ transactions: Transaction[] }> = ({
    transactions,
}) => {
    const stats = useMemo(() => {
        const total = transactions.length;
        const fraudulent = transactions.filter(
            (t) => t.status === 'fraudulent',
        ).length;
        const approved = transactions.filter(
            (t) => t.status === 'approved',
        ).length;
        const inReview = transactions.filter(
            (t) => t.status === 'in_review',
        ).length;
        const fraudRate =
            total > 0 ? ((fraudulent / total) * 100).toFixed(1) : '0.0';

        const totalAmount = transactions.reduce(
            (sum, t) => sum + t.amount,
            0,
        );
        const fraudulentAmount = transactions
            .filter((t) => t.status === 'fraudulent')
            .reduce((sum, t) => sum + t.amount, 0);
        const inReviewAmount = transactions
            .filter((t) => t.status === 'in_review')
            .reduce((sum, t) => sum + t.amount, 0);

        const fraudulentByLocation = transactions
            .filter((t) => t.status === 'fraudulent')
            .reduce((acc, t) => {
                acc[t.location] = (acc[t.location] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

        const chartDataLocation = Object.entries(fraudulentByLocation)
            .map(([location, count]) => ({ location, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            total,
            fraudulent,
            approved,
            inReview,
            fraudRate,
            totalAmount,
            fraudulentAmount,
            inReviewAmount,
            pieChartData: [
                { name: 'Approved', value: approved },
                { name: 'Fraudulent', value: fraudulent },
                { name: 'In Review', value: inReview },
            ].filter((item) => item.value > 0),
            locationChartData: chartDataLocation,
        };
    }, [transactions]);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header + Key Metric Banner */}
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Administrator Overview
                </h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    Last updated: {new Date().toLocaleTimeString()}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Transactions"
                    value={stats.total.toString()}
                    subtitle={`$${stats.totalAmount.toFixed(2)} total value`}
                    color="#6366F1"
                    icon={
                        <svg
                            className="h-6 w-6"
                            style={{ color: '#6366F1' }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            />
                        </svg>
                    }
                />
                <StatCard
                    title="Fraudulent"
                    value={stats.fraudulent.toString()}
                    subtitle={`$${stats.fraudulentAmount.toFixed(
                        2,
                    )} blocked`}
                    color="#EF4444"
                    icon={
                        <svg
                            className="h-6 w-6"
                            style={{ color: '#EF4444' }}
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
                    }
                />
                <StatCard
                    title="Approved"
                    value={stats.approved.toString()}
                    subtitle="Verified legitimate"
                    color="#10B981"
                    icon={
                        <svg
                            className="h-6 w-6"
                            style={{ color: '#10B981' }}
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
                    }
                />
                <StatCard
                    title="Pending Review"
                    value={stats.inReview.toString()}
                    subtitle={`$${stats.inReviewAmount.toFixed(
                        2,
                    )} awaiting`}
                    color="#F59E0B"
                    icon={
                        <svg
                            className="h-6 w-6"
                            style={{ color: '#F59E0B' }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    }
                />
            </div>

            {/* Key Metric Banner */}
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-red-100">
                            System Fraud Rate
                        </p>
                        <p className="text-4xl font-bold mt-1">
                            {stats.fraudRate}%
                        </p>
                        <p className="text-sm text-red-100 mt-1">
                            {stats.fraudulent} fraudulent out of {stats.total}{' '}
                            total transactions
                        </p>
                    </div>
                    <svg
                        className="h-16 w-16 text-red-200"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                    </svg>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TransactionStatusChart data={stats.pieChartData} />
                <FraudByLocationChart data={stats.locationChartData} />
            </div>
        </div>
    );
};

// -----------------------------
// User Management Tab
// -----------------------------

const UserManagementTab: React.FC<{
    users: User[];
    onUserUpdate: (username: string, data: Partial<User>) => Promise<void> | void;
}> = ({ users, onUserUpdate }) => {
    const { user: currentUser } = useAuth();
    const [loadingUser, setLoadingUser] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleRoleChange = async (username: string, newRole: UserRole) => {
        setLoadingUser(username);
        setError(null);
        try {
            await onUserUpdate(username, { role: newRole });
        } catch (err: any) {
            setError(
                `Failed to update role: ${
                    err?.message || 'Unknown error occurred'
                }`,
            );
            console.error('Role update error:', err);
        } finally {
            setLoadingUser(null);
        }
    };

    const handleBanToggle = async (username: string, currentBanStatus: boolean) => {
        setLoadingUser(username);
        setError(null);
        try {
            await onUserUpdate(username, { isBanned: !currentBanStatus });
        } catch (err: any) {
            setError(
                `Failed to update ban status: ${
                    err?.message || 'Unknown error occurred'
                }`,
            );
            console.error('Ban toggle error:', err);
        } finally {
            setLoadingUser(null);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-100 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    User Management
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Manage roles, bans, and access controls.
                </p>
            </div>

            {error && (
                <div className="mb-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md flex justify-between items-center text-sm">
                    <span>{error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="font-bold hover:text-red-900"
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700/60">
                    <thead className="bg-gray-50 dark:bg-gray-900/60">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                                User
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                                Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                                Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                        {users.map((u) => (
                            <tr
                                key={u.username}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors ${
                                    loadingUser === u.username
                                        ? 'opacity-60'
                                        : ''
                                }`}
                            >
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {u.fullName || u.username}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {u.email}
                                        </span>
                                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                            @{u.username}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <select
                                        value={u.role}
                                        onChange={(e) =>
                                            handleRoleChange(
                                                u.username,
                                                e.target
                                                    .value as UserRole,
                                            )
                                        }
                                        className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                        disabled={
                                            u.username === currentUser?.username ||
                                            loadingUser === u.username
                                        }
                                    >
                                        {Object.values(UserRole).map(
                                            (role) => (
                                                <option
                                                    key={role}
                                                    value={role}
                                                >
                                                    {role}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                            u.isBanned
                                                ? 'bg-white text-red-600 border-red-400'
                                                : 'bg-white text-green-600 border-green-400'
                                        }`}
                                    >
                                        {u.isBanned ? 'Banned' : 'Active'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                    <button
                                        onClick={() =>
                                            handleBanToggle(
                                                u.username,
                                                u.isBanned,
                                            )
                                        }
                                        className={`py-1.5 px-4 rounded-md font-semibold border transition ${
                                            u.isBanned
                                                ? 'bg-white text-green-600 border-green-400 hover:bg-green-50'
                                                : 'bg-white text-red-600 border-red-400 hover:bg-red-50'
                                        } disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed`}
                                        disabled={
                                            u.username === currentUser?.username ||
                                            loadingUser === u.username
                                        }
                                    >
                                        {loadingUser === u.username
                                            ? '...'
                                            : u.isBanned
                                            ? 'Unban'
                                            : 'Ban'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                                >
                                    No users found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// -----------------------------
// Fraud Rule Engine Tab
// -----------------------------

const FraudRuleEngineTab: React.FC<{
    rules: FraudRule[];
    onRuleAdd: (rule: Omit<FraudRule, 'id'>) => void;
    onRuleDelete: (ruleId: string) => void;
}> = ({ rules, onRuleAdd, onRuleDelete }) => {
    const [type, setType] = useState<FraudRuleType>('amount');
    const [threshold, setThreshold] = useState('');
    const [keyword, setKeyword] = useState('');
    const [result, setResult] = useState<'fraudulent' | 'in_review'>(
        'in_review',
    );

    const handleAddRule = () => {
        let newRule: Omit<FraudRule, 'id'> | null = null;
        if (type === 'amount' && threshold) {
            newRule = {
                type,
                threshold: parseFloat(threshold),
                result,
                description: `Amount > $${threshold}`,
            };
        } else if (type === 'merchantKeyword' && keyword) {
            newRule = {
                type,
                keyword,
                result,
                description: `Merchant keyword: "${keyword}"`,
            };
        }
        if (newRule) {
            onRuleAdd(newRule);
            setThreshold('');
            setKeyword('');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Add New Rule
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Rule Type
                        </label>
                        <select
                            value={type}
                            onChange={(e) =>
                                setType(e.target.value as FraudRuleType)
                            }
                            className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="amount">Amount Threshold</option>
                            <option value="merchantKeyword">
                                Merchant Keyword
                            </option>
                        </select>
                    </div>
                    {type === 'amount' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Threshold Amount
                            </label>
                            <input
                                type="number"
                                placeholder="e.g., 500"
                                value={threshold}
                                onChange={(e) => setThreshold(e.target.value)}
                                className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    )}
                    {type === 'merchantKeyword' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Keyword
                            </label>
                            <input
                                type="text"
                                placeholder='e.g., "crypto"'
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Result
                        </label>
                        <select
                            value={result}
                            onChange={(e) =>
                                setResult(e.target.value as
                                    | 'fraudulent'
                                    | 'in_review')
                            }
                            className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="in_review">Flag for Review</option>
                            <option value="fraudulent">
                                Flag as Fraudulent
                            </option>
                        </select>
                    </div>
                    <button
                        onClick={handleAddRule}
                        className="w-full py-2 px-4 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Add Rule
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Current Rules
                </h3>
                <ul className="space-y-2">
                    {rules.map((rule) => (
                        <li
                            key={rule.id}
                            className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md text-sm"
                        >
                            <span className="text-gray-800 dark:text-gray-100">
                                {rule.description}{' '}
                                <span className="text-xs text-gray-500 dark:text-gray-300">
                                    → {rule.result.replace('_', ' ')}
                                </span>
                            </span>
                            <button
                                onClick={() => onRuleDelete(rule.id)}
                                className="text-red-500 hover:text-red-700 text-lg leading-none"
                            >
                                &times;
                            </button>
                        </li>
                    ))}
                    {rules.length === 0 && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                            No fraud rules configured.
                        </p>
                    )}
                </ul>
            </div>
        </div>
    );
};

// -----------------------------
// Audit Log Tab
// -----------------------------

const AuditLogTab: React.FC<{ logs: AuditLog[] }> = ({ logs }) => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-100 dark:border-gray-700 max-w-7xl mx-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                System Audit Logs
            </h3>
            <div className="overflow-y-auto max-h-[60vh] border border-gray-100 dark:border-gray-700 rounded-md">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/70 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                                Timestamp
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                                Actor
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                                Action
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {logs.map((log) => (
                            <tr key={log.id}>
                                <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                                    {new Date(
                                        log.timestamp,
                                    ).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                                    {log.actor}
                                </td>
                                <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                                    {log.details}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {logs.length === 0 && (
                    <p className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                        No audit log entries found.
                    </p>
                )}
            </div>
        </div>
    );
};

// -----------------------------
// Main Admin Dashboard
// -----------------------------

type AdminTab = 'overview' | 'transactions' | 'users' | 'rules' | 'logs';

interface AdminDashboardProps {
    transactions: Transaction[];
    auditLogs: AuditLog[];
    fraudRules: FraudRule[];
    onStatusUpdate: (
        transactionId: string,
        newStatus: any,
        note: string,
    ) => void;
    onUserUpdate: (username: string, data: Partial<User>) => Promise<void> | void;
    onRuleAdd: (rule: Omit<FraudRule, 'id'>) => void;
    onRuleDelete: (ruleId: string) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const { users } = useAuth();

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab transactions={props.transactions} />;
            case 'transactions':
                return (
                    <EmployeeDashboard
                        transactions={props.transactions}
                        onStatusUpdate={props.onStatusUpdate}
                    />
                );
            case 'users':
                return (
                    <UserManagementTab
                        users={users}
                        onUserUpdate={props.onUserUpdate}
                    />
                );
            case 'rules':
                return (
                    <FraudRuleEngineTab
                        rules={props.fraudRules}
                        onRuleAdd={props.onRuleAdd}
                        onRuleDelete={props.onRuleDelete}
                    />
                );
            case 'logs':
                return <AuditLogTab logs={props.auditLogs} />;
            default:
                return null;
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Administrator Dashboard
            </h2>

            <div className="mb-2">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
                    <TabButton
                        active={activeTab === 'overview'}
                        onClick={() => setActiveTab('overview')}
                    >
                        Overview
                    </TabButton>
                    <TabButton
                        active={activeTab === 'transactions'}
                        onClick={() => setActiveTab('transactions')}
                    >
                        Transaction Management
                    </TabButton>
                    <TabButton
                        active={activeTab === 'users'}
                        onClick={() => setActiveTab('users')}
                    >
                        User Management
                    </TabButton>
                    <TabButton
                        active={activeTab === 'rules'}
                        onClick={() => setActiveTab('rules')}
                    >
                        Fraud Rule Engine
                    </TabButton>
                    <TabButton
                        active={activeTab === 'logs'}
                        onClick={() => setActiveTab('logs')}
                    >
                        Audit Logs
                    </TabButton>
                </div>
            </div>

            <div>{renderTabContent()}</div>
        </div>
    );
};

export default AdminDashboard;
