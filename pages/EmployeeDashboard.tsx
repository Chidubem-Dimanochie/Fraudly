import React, { useMemo, useState } from "react";
import { Transaction, TransactionStatus } from "../types";
import { useAuth } from "../context/AuthContext";

const StatusPill: React.FC<{ status: Transaction["status"] }> = ({ status }) => {
  const base = "px-3 py-1 rounded-full text-xs font-semibold border capitalize";
  if (status === "approved")
    return (
      <span className={`${base} bg-white text-green-600 border-green-400`}>
        approved
      </span>
    );
  if (status === "fraudulent")
    return (
      <span className={`${base} bg-white text-red-600 border-red-400`}>
        fraudulent
      </span>
    );
  return (
    <span className={`${base} bg-white text-yellow-700 border-yellow-400`}>
      in review
    </span>
  );
};

const getAiRisk = (t: Transaction): string => {
  const anyT = t as any;
  const v = t.modelScore ?? anyT.mlProbability;
  return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "N/A";
};

const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}…` : id);

const ReviewModal: React.FC<{
  txn: Transaction;
  onClose: () => void;
  onSave: (newStatus: TransactionStatus, note: string) => void;
}> = ({ txn, onClose, onSave }) => {
  const canUpdate = txn.status === "in_review";

  // ✅ Only meaningful choices when in_review
  const initialStatus: TransactionStatus = canUpdate ? "approved" : txn.status;
  const [newStatus, setNewStatus] = useState<TransactionStatus>(initialStatus);
  const [note, setNote] = useState("");

  const saveDisabled = !canUpdate || !note.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Transaction Review
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">ID: {txn.id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">User</div>
              <div className="text-gray-900 dark:text-white">{txn.userEmail}</div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Amount</div>
              <div className="text-gray-900 dark:text-white">${txn.amount.toFixed(2)}</div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Merchant</div>
              <div className="text-gray-900 dark:text-white">{txn.merchant}</div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Location</div>
              <div className="text-gray-900 dark:text-white">{txn.location}</div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
              <div className="text-gray-900 dark:text-white">{txn.status}</div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">AI Risk</div>
              <div className="text-gray-900 dark:text-white">{getAiRisk(txn)}</div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Reason</div>
            <div className="text-gray-900 dark:text-white">{txn.reason}</div>
          </div>

          {!canUpdate && (
            <div className="rounded-md bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-300">
              This transaction is <span className="font-semibold">final</span> and cannot be changed
              because it is <span className="font-semibold">{txn.status}</span>. Only{" "}
              <span className="font-semibold">in_review</span> transactions can be updated.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Update Status
              </label>

              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as TransactionStatus)}
                disabled={!canUpdate}
                className={`mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500
                           ${!canUpdate ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {canUpdate ? (
                  <>
                    <option value="approved">approved</option>
                    <option value="fraudulent">fraudulent</option>
                  </>
                ) : (
                  <option value={txn.status}>{txn.status}</option>
                )}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Analyst Note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={!canUpdate}
                className={`mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500
                           ${!canUpdate ? "opacity-60 cursor-not-allowed" : ""}`}
                placeholder={canUpdate ? "Explain your decision..." : "Final status — notes disabled"}
              />
              {canUpdate && (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Note is required to save.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-md font-semibold border
                       bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200
                       border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(newStatus, note.trim() || "Reviewed.")}
            disabled={saveDisabled}
            className={`py-2 px-4 rounded-md font-semibold border border-transparent
                       bg-indigo-600 text-white hover:bg-indigo-700
                       ${saveDisabled ? "opacity-60 cursor-not-allowed hover:bg-indigo-600" : ""}`}
            title={
              !canUpdate
                ? "Only in_review transactions can be updated"
                : !note.trim()
                ? "Add a justification note to save"
                : "Save review"
            }
          >
            Save Review
          </button>
        </div>
      </div>
    </div>
  );
};

interface Props {
  transactions: Transaction[];
  onStatusUpdate: (transactionId: string, newStatus: TransactionStatus, note: string) => void;
}

const EmployeeDashboard: React.FC<Props> = ({ transactions, onStatusUpdate }) => {
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TransactionStatus | "all">("all");
  const [selected, setSelected] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.merchant.toLowerCase().includes(search.toLowerCase()) ||
        t.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        new Date(t.timestamp).toLocaleDateString().includes(search);

      const matchesStatus = filter === "all" || t.status === filter;
      return matchesSearch && matchesStatus;
    });
  }, [transactions, search, filter]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-100 dark:border-gray-700 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Transaction Monitoring
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Review transactions and update statuses.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user, merchant, or date..."
          className="flex-grow block w-full rounded-md border border-gray-300 dark:border-gray-600
                     shadow-sm focus:border-indigo-500 focus:ring-indigo-500
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="block w-full sm:w-52 rounded-md border border-gray-300 dark:border-gray-600
                     shadow-sm focus:border-indigo-500 focus:ring-indigo-500
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="fraudulent">Fraudulent</option>
          <option value="in_review">In Review</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700/60">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                Txn
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                Merchant
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                AI Risk
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-300 uppercase">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {shortId(t.id)}
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(t.timestamp).toLocaleString()}
                  </div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                  {t.userEmail}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                  ${t.amount.toFixed(2)}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                  <div className="font-medium">{t.merchant}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t.location}</div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <StatusPill status={t.status} />
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                  {getAiRisk(t)}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                  <button
                    onClick={() => setSelected(t)}
                    className="py-1.5 px-4 rounded-md font-semibold border transition
                               bg-white text-indigo-600 border-indigo-400 hover:bg-indigo-50"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No transactions match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ReviewModal
          txn={selected}
          onClose={() => setSelected(null)}
          onSave={(status, note) => {
            if (!user) return;
            onStatusUpdate(selected.id, status, note);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
};

export default EmployeeDashboard;

