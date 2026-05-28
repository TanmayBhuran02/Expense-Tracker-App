import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { runSync } from "../services/syncService";
import { db, deleteTransaction } from "../db/db";
import { logout, isAuthenticated } from "../services/api";
import { showToast, dismissToast } from "../components/Toast";
import TransactionModal, { CATEGORY_MAP } from "../components/TransactionModal";
import { logger } from "../utils/logger";

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
    <div className="animate-pulse space-y-8 max-w-4xl mx-auto py-8">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center mb-8">
        <div className="h-8 bg-slate-800 rounded w-1/3" />
        <div className="h-8 bg-slate-800 rounded-full w-24" />
      </div>
      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-800 rounded-xl h-28 border border-slate-700/30" />
        ))}
      </div>
      {/* List Skeleton */}
      <div className="h-64 bg-slate-800 rounded-xl border border-slate-700/30" />
    </div>
  );
}

// ── Dashboard Page ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const isOnline = useOnlineStatus();
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // Swipe-to-delete state
  const [swipedId, setSwipedId] = useState(null);
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });

  // Close swiped items when clicking elsewhere
  useEffect(() => {
    const handleDocumentClick = () => {
      if (swipedId !== null) setSwipedId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [swipedId]);

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

  // Filter out any locally soft-deleted records (precautionary double check)
  const activeTransactions = transactions.filter((t) => !t.deleted);

  // Compute totals based on non-deleted transactions
  const totalIncome = activeTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalExpenses = activeTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalBalance = totalIncome - totalExpenses;

  // Sync status badge metadata
  const syncBadge = !isOnline
    ? { icon: "🔴", label: "Offline" }
    : pendingCount > 0
    ? { icon: "🟡", label: `${pendingCount} Pending` }
    : { icon: "🟢", label: "Synced" };

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    const toastId = showToast("Syncing…", "info", 0);
    try {
      const result = await runSync();
      dismissToast(toastId);
      showToast(`Synced ✓ — pushed ${result.pushed}, pulled ${result.pulled}`, "success");
    } catch (err) {
      dismissToast(toastId);
      logger.error("Manual sync failed:", err);
      showToast(`Sync failed: ${err.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTransaction(id);
      showToast("Transaction deleted successfully", "success");
      // Trigger sync if online
      if (isOnline && isAuthenticated()) {
        runSync().catch((err) => {
          logger.error("Auto sync after delete failed:", err);
        });
      }
    } catch (err) {
      logger.error("Delete transaction failed:", err);
      showToast(`Failed to delete transaction: ${err.message}`, "error");
    }
  };

  const handleExportCSV = () => {
    if (activeTransactions.length === 0) {
      showToast("No transactions to export", "error");
      return;
    }

    const headers = ["ID", "Type", "Category", "Amount", "Date", "Status"];
    const rows = activeTransactions.map((t) => [
      t.client_uuid,
      t.type,
      t.category,
      t.amount,
      t.timestamp,
      t.sync_status,
    ]);

    const csvString = [
      headers.join(","),
      ...rows.map((r) => r.map((val) => `"${val.toString().replace(/"/g, '""')}"`).join(",")),
    ].join("\r\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `transactions_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Exported successfully!", "success");
  };

  // Swipe gesture handlers
  const handleTouchStart = (e) => {
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
  };

  const handleTouchEnd = (e, id) => {
    const diffX = touchStart.x - e.changedTouches[0].clientX;
    const diffY = touchStart.y - e.changedTouches[0].clientY;

    // Detect left swipe (reveal delete)
    if (diffX > 60 && Math.abs(diffY) < 40) {
      setSwipedId(id);
    }
    // Detect right swipe (hide delete)
    else if (diffX < -60 && Math.abs(diffY) < 40) {
      if (swipedId === id) setSwipedId(null);
    }
  };

  // Filter transactions in real-time
  const filteredTransactions = activeTransactions.filter((t) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const amountStr = t.amount.toString();
    return (
      t.category.toLowerCase().includes(query) ||
      amountStr.includes(query)
    );
  });

  const renderListContent = () => {
    const isFreshOffline = activeTransactions.length === 0 && !isOnline;

    if (isFreshOffline) {
      return (
        <div className="p-12 text-center" role="status">
          <p className="text-4xl mb-4" aria-hidden="true">🛜</p>
          <p className="text-slate-400 text-lg mb-2">You're offline</p>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
            Add transactions and they'll sync when you reconnect.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-md"
          >
            Add Transaction Offline
          </button>
        </div>
      );
    }

    if (activeTransactions.length === 0) {
      return (
        <div className="p-12 text-center" role="status">
          <p className="text-4xl mb-4" aria-hidden="true">📝</p>
          <p className="text-slate-400 text-lg mb-2">No transactions yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-blue-400 hover:text-blue-300 font-medium underline"
          >
            Add your first transaction →
          </button>
        </div>
      );
    }

    if (filteredTransactions.length === 0) {
      return (
        <div className="p-12 text-center" role="status">
          <p className="text-4xl mb-4" aria-hidden="true">🔍</p>
          <p className="text-slate-400 text-lg mb-2">No transactions match your search</p>
          <p className="text-xs text-slate-500">Try adjusting your filters or search keywords.</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-700/50">
        {filteredTransactions.map((t) => {
          const emoji = CATEGORY_MAP[t.category] || "📦";
          const isExpense = t.type === "expense";
          return (
            <div key={t.id || t.client_uuid} className="relative overflow-hidden group">
              {/* Swipe-to-delete Red Background Layer (underneath) */}
              <div className="absolute inset-y-0 right-0 w-[80px] bg-red-600 flex items-center justify-center z-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t.id);
                  }}
                  className="w-full h-full text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors"
                  aria-label={`Delete ${t.category} transaction`}
                >
                  Delete
                </button>
              </div>

              {/* Main Transaction Card content */}
              <div
                onTouchStart={handleTouchStart}
                onTouchEnd={(e) => handleTouchEnd(e, t.id)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  transform: swipedId === t.id ? "translateX(-80px)" : "translateX(0px)",
                }}
                className="relative z-10 flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-750 transition-transform duration-200"
              >
                {/* Category Icon */}
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
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
                  <p className="text-xs text-slate-500" aria-label={`Sync status: ${t.sync_status}`}>
                    {t.sync_status === "pending" ? "🟡" : "🟢"}
                  </p>
                </div>

                {/* Desktop Trash Button (visible on hover) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t.id);
                  }}
                  className="hidden md:flex p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-all shrink-0"
                  aria-label={`Delete ${t.category} transaction`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-2 sm:px-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Expense Tracker</h1>
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 text-sm font-medium border border-slate-700/50"
            aria-label={`App is current ${syncBadge.label}`}
          >
            <span aria-hidden="true">{syncBadge.icon}</span>
            <span>{syncBadge.label}</span>
          </div>
          <button
            onClick={() => {
              logout();
              window.location.reload();
            }}
            className="text-sm text-slate-400 hover:text-white underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className={`p-5 rounded-xl shadow-lg transition-all ${
          totalBalance >= 0 ? "bg-emerald-950/40 border border-emerald-800/50" : "bg-red-950/40 border border-red-800/50"
        }`}>
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

      {/* Control Bar: Search & Export */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400" aria-hidden="true">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search by category or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-800 border border-slate-700/50 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm transition-all shadow-md"
            aria-label="Search transactions"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
              aria-label="Clear search query"
            >
              ×
            </button>
          )}
        </div>
        
        <button
          onClick={handleExportCSV}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          📥 Export CSV
        </button>
      </div>

      {/* Transaction List Header */}
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Transactions</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={!isOnline || isSyncing}
            className="bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 disabled:opacity-50 text-sm transition-all flex items-center gap-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {isSyncing ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Syncing...</span>
              </>
            ) : (
              <span>Sync Now</span>
            )}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-bold transition-all shadow-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Transaction List Container */}
      <div className="bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-700/50">
        {renderListContent()}
      </div>

      {/* Floating Action Button (FAB) for mobile view */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-xl text-2xl font-bold text-white flex items-center justify-center transition-transform hover:scale-110 md:hidden z-30 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        aria-label="Add transaction"
      >
        +
      </button>

      {/* Transaction Modal */}
      <TransactionModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
