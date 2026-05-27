import { useState, useEffect } from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { runSync } from "../services/syncService";
import { addTransaction, getAllTransactions, getPendingTransactions } from "../db/db";
import { logout } from "../services/api";

export default function DashboardPage() {
  const isOnline = useOnlineStatus();
  const [transactions, setTransactions] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  
  // form state
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("food");

  const loadData = async () => {
    setTransactions(await getAllTransactions());
    const pending = await getPendingTransactions();
    setPendingCount(pending.length);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline) {
      handleSync();
    }
  }, [isOnline]);

  const handleAdd = async (e) => {
    e.preventDefault();
    await addTransaction({ amount, type, category });
    setAmount("");
    loadData();
    if (isOnline) {
      handleSync();
    }
  };

  const handleSync = async () => {
    if (!isOnline) return;
    try {
      await runSync();
      loadData();
    } catch (err) {
      console.error("Sync failed:", err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Expense Tracker</h1>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${isOnline ? 'bg-green-600' : 'bg-red-600'}`}>
            {isOnline ? "Online" : "Offline"}
          </div>
          <button onClick={() => { logout(); window.location.reload(); }} className="text-sm underline">Logout</button>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded shadow mb-8">
        <h2 className="text-xl font-bold mb-4">Add Transaction</h2>
        <form onSubmit={handleAdd} className="flex gap-4">
          <input type="number" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount" className="flex-1 p-2 rounded bg-slate-700" />
          <select value={type} onChange={e=>setType(e.target.value)} className="p-2 rounded bg-slate-700">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <input type="text" required value={category} onChange={e=>setCategory(e.target.value)} placeholder="Category (e.g. food)" className="flex-1 p-2 rounded bg-slate-700" />
          <button type="submit" className="bg-blue-600 px-4 rounded font-bold hover:bg-blue-700">Add</button>
        </form>
      </div>

      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Transactions</h2>
        <button onClick={handleSync} disabled={!isOnline} className="bg-slate-700 px-4 py-2 rounded hover:bg-slate-600 disabled:opacity-50">
          Sync Now {pendingCount > 0 && `(${pendingCount} pending)`}
        </button>
      </div>

      <div className="bg-slate-800 rounded shadow overflow-hidden">
        {transactions.length === 0 ? (
          <p className="p-4 text-slate-400">No transactions yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-700">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Type</th>
                <th className="p-4">Category</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id || t.client_uuid} className="border-t border-slate-700">
                  <td className="p-4">{new Date(t.timestamp).toLocaleString()}</td>
                  <td className="p-4 capitalize text-sm">{t.type}</td>
                  <td className="p-4">{t.category}</td>
                  <td className={`p-4 font-bold ${t.type === 'expense' ? 'text-red-400' : 'text-green-400'}`}>
                    ${parseFloat(t.amount).toFixed(2)}
                  </td>
                  <td className="p-4 text-sm text-slate-400">{t.sync_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
