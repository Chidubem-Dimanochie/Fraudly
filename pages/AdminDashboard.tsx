import React, { useMemo, useState } from 'react';
import { Transaction, User, UserRole, AuditLog, FraudRule, FraudRuleType } from '../types';
import { useAuth } from '../context/AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import EmployeeDashboard from './EmployeeDashboard';

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
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

// --- Overview Tab Components ---

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center space-x-4">
        <div className="bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-full">{icon}</div>
        <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
    </div>
);

const TransactionStatusChart: React.FC<{ data: { name: string, value: number }[] }> = ({ data }) => {
    const COLORS = ['#10B981', '#EF4444', '#F59E0B'];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Transaction Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie data={data} cx="50%" cy="50%" labelLine={false} outerRadius={100} fill="#8884d8" dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', color: '#FFF' }}/>
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

const FraudByLocationChart: React.FC<{ data: { location: string, count: number }[] }> = ({ data }) => {
    return (
         <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Global Fraud Hotspots</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="location" />
                    <YAxis allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', color: '#FFF' }} />
                    <Legend />
                    <Bar dataKey="count" fill="#EF4444" name="Fraudulent Transactions" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

const OverviewTab: React.FC<{ 
    transactions: Transaction[],
}> = ({ transactions }) => {
    const stats = useMemo(() => {
        const total = transactions.length;
        const fraudulent = transactions.filter(t => t.status === 'fraudulent').length;
        const approved = transactions.filter(t => t.status === 'approved').length;
        const inReview = transactions.filter(t => t.status === 'in_review').length;
        const fraudRate = total > 0 ? ((fraudulent / total) * 100).toFixed(1) : '0.0';

        const fraudulentByLocation = transactions.filter(t => t.status === 'fraudulent').reduce((acc, t) => {
                acc[t.location] = (acc[t.location] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
        
        const chartDataLocation = Object.entries(fraudulentByLocation)
            .map(([location, count]) => ({ location, count }))
            .sort((a,b) => (b.count as number) - (a.count as number))
            .slice(0, 5);

        return {
            total, fraudulent, approved, inReview, fraudRate,
            pieChartData: [{ name: 'Approved', value: approved }, { name: 'Fraudulent', value: fraudulent }, { name: 'In Review', value: inReview }].filter(item => item.value > 0),
            locationChartData: chartDataLocation,
        };
    }, [transactions]);
    
    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Transactions" value={stats.total.toString()} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>} />
                <StatCard title="Fraudulent" value={stats.fraudulent.toString()} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                <StatCard title="Approved" value={stats.approved.toString()} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                <StatCard title="Fraud Rate" value={`${stats.fraudRate}%`} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
            </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TransactionStatusChart data={stats.pieChartData} />
                <FraudByLocationChart data={stats.locationChartData} />
            </div>
        </div>
    );
};


// --- User Management Tab ---
const UserManagementTab: React.FC<{ users: User[], onUserUpdate: (email: string, data: Partial<User>) => void }> = ({ users, onUserUpdate }) => {
    const { user: currentUser } = useAuth();
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">User Management</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {users.map(u => (
                            <tr key={u.email}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{u.email}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <select 
                                        value={u.role} 
                                        onChange={e => onUserUpdate(u.email, { role: e.target.value as UserRole })} 
                                        className="p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                                        disabled={u.email === currentUser?.email} // Admins cannot change their own role
                                    >
                                        {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{u.isBanned ? 'Banned' : 'Active'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <button 
                                        onClick={() => onUserUpdate(u.email, { isBanned: !u.isBanned })} 
                                        className={`py-1 px-3 rounded ${u.isBanned ? 'bg-green-500' : 'bg-red-500'} text-white disabled:bg-gray-400`}
                                        disabled={u.email === currentUser?.email} // Admins cannot ban themselves
                                    >
                                        {u.isBanned ? 'Unban' : 'Ban'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Fraud Rule Engine Tab ---
const FraudRuleEngineTab: React.FC<{ rules: FraudRule[], onRuleAdd: (rule: Omit<FraudRule, 'id'>) => void, onRuleDelete: (ruleId: string) => void }> = ({ rules, onRuleAdd, onRuleDelete }) => {
    const [type, setType] = useState<FraudRuleType>('amount');
    const [threshold, setThreshold] = useState('');
    const [keyword, setKeyword] = useState('');
    const [result, setResult] = useState<'fraudulent' | 'in_review'>('in_review');

    const handleAddRule = () => {
        let newRule: Omit<FraudRule, 'id'> | null = null;
        if (type === 'amount' && threshold) {
            newRule = { type, threshold: parseFloat(threshold), result, description: `Amount > $${threshold}` };
        } else if (type === 'merchantKeyword' && keyword) {
            newRule = { type, keyword, result, description: `Merchant keyword: "${keyword}"` };
        }
        if (newRule) {
            onRuleAdd(newRule);
            setThreshold('');
            setKeyword('');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4">Add New Rule</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">Rule Type</label>
                        <select value={type} onChange={e => setType(e.target.value as FraudRuleType)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                            <option value="amount">Amount Threshold</option>
                            <option value="merchantKeyword">Merchant Keyword</option>
                        </select>
                    </div>
                    {type === 'amount' && (
                        <input type="number" placeholder="Threshold Amount" value={threshold} onChange={e => setThreshold(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    )}
                    {type === 'merchantKeyword' && (
                        <input type="text" placeholder="Keyword (e.g., crypto)" value={keyword} onChange={e => setKeyword(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    )}
                    <div>
                        <label className="block text-sm font-medium">Result</label>
                         <select value={result} onChange={e => setResult(e.target.value as any)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                            <option value="in_review">Flag for Review</option>
                            <option value="fraudulent">Flag as Fraudulent</option>
                        </select>
                    </div>
                    <button onClick={handleAddRule} className="w-full py-2 px-4 rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Add Rule</button>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4">Current Rules</h3>
                <ul className="space-y-2">
                    {rules.map(rule => (
                        <li key={rule.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                            <span>{rule.description} &rarr; <span className="font-semibold capitalize">{rule.result.replace('_', ' ')}</span></span>
                            <button onClick={() => onRuleDelete(rule.id)} className="text-red-500 hover:text-red-700">&times;</button>
                        </li>
                    ))}
                     {rules.length === 0 && <p className="text-gray-500 text-sm">No fraud rules configured.</p>}
                </ul>
            </div>
        </div>
    );
};

// --- Audit Log Tab ---
const AuditLogTab: React.FC<{ logs: AuditLog[] }> = ({ logs }) => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">System Audit Logs</h3>
            <div className="overflow-y-auto max-h-[60vh]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase">Timestamp</th>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase">Actor</th>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{log.actor}</td>
                                <td className="px-4 py-2 text-sm">{log.details}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {logs.length === 0 && <p className="text-center py-8 text-gray-500">No audit log entries found.</p>}
            </div>
        </div>
    );
};


// --- Main Admin Dashboard Component ---
type AdminTab = 'overview' | 'transactions' | 'users' | 'rules' | 'logs';

interface AdminDashboardProps {
    transactions: Transaction[];
    auditLogs: AuditLog[];
    fraudRules: FraudRule[];
    onStatusUpdate: (transactionId: string, newStatus: any, note: string) => void;
    onUserUpdate: (email: string, data: Partial<User>) => void;
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
                return <EmployeeDashboard transactions={props.transactions} onStatusUpdate={props.onStatusUpdate} />;
            case 'users':
                return <UserManagementTab users={users} onUserUpdate={props.onUserUpdate} />;
            case 'rules':
                return <FraudRuleEngineTab rules={props.fraudRules} onRuleAdd={props.onRuleAdd} onRuleDelete={props.onRuleDelete} />;
            case 'logs':
                return <AuditLogTab logs={props.auditLogs} />;
            default:
                return null;
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">Administrator Dashboard</h2>
            
            <div className="mb-6">
                 <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
                    <TabButton active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')}>Transaction Management</TabButton>
                    <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')}>User Management</TabButton>
                    <TabButton active={activeTab === 'rules'} onClick={() => setActiveTab('rules')}>Fraud Rule Engine</TabButton>
                    <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>Audit Logs</TabButton>
                </div>
            </div>

            <div>{renderTabContent()}</div>
        </div>
    );
};

export default AdminDashboard;