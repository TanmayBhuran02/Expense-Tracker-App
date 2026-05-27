import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { runSync } from "../services/syncService";
import { db, getPendingTransactions } from "../db/db";
import { logout } from "../services/api";
import { showToast } from "../components/Toast";
import TransactionModal, { CATEGORY_MAP } from "../components/TransactionModal";

// ── Relative time formatter ─────────────────────────────────────────────────
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function getRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = then - now;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMs / 3600000);
  const diffDay = Math.round(diffMs / 86400000);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  return rtf.format(diffDay, "day");
}

// ── Number formatting ───────────────────────────────────────────────────────
const compactFmt = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const currencyFmt = new Intl.NumberFormat("en", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(n) {
  return Math.abs(n) >= 1_000_000 ? compactFmt.format(n) : currencyFmt.format(n);
}

// ── Skeleton Loader ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-800 rounded-xl h-24" />
        ))}
      </div>
      <div className="bg-slate-800 rounded-xl h-64" />
    </div>
  );
}

// ── Dashboard Page ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const isOnline = useOnlineStatus();
  const [showModal, setShowModal] = useState(false);

  // Live queries — reactively update on every IndexedDB write
  const transactions = useLiveQuery(() =>
    db.transactions.orderBy("timestamp").reverse().toArray()
  );
  const pendingCount = useLiveQuery(() =>
    db.transactions.where("sync_status").equals("pending").count()
  );

  // Loading state — useLiveQuery returns undefined before IndexedDB is ready
  if (transactions === undefined || pendingCount === undefined) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Skeleton />
      </div>
    );
  }

  // Compute totals
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalBalance = totalIncome - totalExpenses;

  // Sync status badge
  const syncBadge = !isOnline
    ? { icon: "🔴", label: "Offline" }
    : pendingCount > 0
    ? { icon: "🟡", label: `${pendingCount} Pending` }
    : { icon: "🟢", label: "Synced" };

  const handleSync = async () => {
    if (!isOnline) return;
    showToast("Syncing…", "info", 0);
    try {
      const result = await runSync();
      showToast(`Synced ✓ — pushed ${result.pushed}, pulled ${result.pulled}`, "success");
    } catch (err) {
      showToast(`Sync failed: ${err.message}`, "error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Expense Tracker</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 text-sm font-medium">
            <span>{syncBadge.icon}</span>
            <span>{syncBadge.label}</span>
          </div>
          <button
            onClick={() => { logout(); window.location.reload(); }}
            className="text-sm text-slate-400 hover:text-white underline"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className={`p-5 rounded-xl shadow-lg ${totalBalance >= 0 ? "bg-emerald-900/40 border border-emerald-700/50" : "bg-red-900/40 border border-red-700/50"}`}>
          <p className="text-sm text-slate-400 mb-1">Total Balance</p>
          <p className={`text-2xl font-bold ${totalBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            ${formatAmount(totalBalance)}
          </p>
        </div>
        <div className="bg-slate-800 p-5 rounded-xl shadow-lg border border-slate-700/50">
          <p className="text-sm text-slate-400 mb-1">Total Income</p>
          <p className="text-2xl font-bold text-emerald-400">
            +${formatAmount(totalIncome)}
          </p>
        </div>
        <div className="bg-slate-800 p-5 rounded-xl shadow-lg border border-slate-700/50">
          <p className="text-sm text-slate-400 mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-red-400">
            -${formatAmount(totalExpenses)}
          </p>
        </div>
      </div>

      {/* Transaction List Header */}
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Transactions</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={!isOnline}
            className="bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 disabled:opacity-50 text-sm transition-colors"
          >
            Sync Now
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-bold transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-700/50">
        {transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-4">📝</p>
            <p className="text-slate-400 text-lg mb-2">No transactions yet</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              Add your first transaction →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {transactions.map((t) => {
              const emoji = CATEGORY_MAP[t.category] || "📦";
              const isExpense = t.type === "expense";
              return (
                <div
                  key={t.id || t.client_uuid}
                  className="flex items-center gap-4 p-4 hover:bg-slate-700/30 transition-colors"
                >
                  {/* Category Icon */}
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg shrink-0">
                    {emoji}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium capitalize truncate">{t.category}</p>
                    <p className="text-sm text-slate-400">{getRelativeTime(t.timestamp)}</p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className={`font-bold ${isExpense ? "text-red-400" : "text-emerald-400"}`}>
                      {isExpense ? "-" : "+"}${formatAmount(parseFloat(t.amount))}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.sync_status === "pending" ? "🟡" : "🟢"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB for mobile */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-xl text-2xl font-bold text-white flex items-center justify-center transition-transform hover:scale-110 md:hidden z-30"
      >
        +
      </button>

      {/* Transaction Modal */}
      <TransactionModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
