import { useState } from "react";
import { addTransaction } from "../db/db";
import { runSync } from "../services/syncService";
import { isAuthenticated } from "../services/api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { showToast } from "./Toast";

const CATEGORY_MAP = {
  food: "🍔",
  transport: "🚗",
  salary: "💼",
  shopping: "🛍️",
  health: "💊",
  other: "📦",
};

export { CATEGORY_MAP };

/**
 * TransactionModal — slide-up bottom sheet (mobile) / centered modal (desktop).
 * Validates input, writes to IndexedDB instantly, and fires sync if online.
 */
export default function TransactionModal({ isOpen, onClose }) {
  const isOnline = useOnlineStatus();
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("food");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16)); // datetime-local format
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      return "Amount must be greater than 0";
    }
    // Max 10 digits before decimal
    const intPart = Math.floor(num).toString();
    if (intPart.length > 10) {
      return "Amount is too large (max 10 digits)";
    }
    if (!date) {
      return "Please select a date";
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setIsSubmitting(true);

    try {
      // Round to 2 decimal places
      const roundedAmount = Math.round(parseFloat(amount) * 100) / 100;
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        setError("Invalid date selected");
        setIsSubmitting(false);
        return;
      }

      await addTransaction({
        amount: roundedAmount,
        type,
        category,
        timestamp: parsedDate.toISOString(),
      });

      // Reset form
      setAmount("");
      setType("expense");
      setCategory("food");
      setDate(new Date().toISOString().slice(0, 16));
      onClose();

      // Fire-and-forget sync if online
      if (isOnline && isAuthenticated()) {
        runSync().catch((err) => {
          showToast(`Sync failed: ${err.message}`, "error");
        });
      }
    } catch (err) {
      console.error("Transaction save error:", err);
      setError(`Failed to save: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50">
        <div className="bg-slate-800 rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Add Transaction</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Amount */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-700 text-white text-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            {/* Type Toggle (pill) */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Type</label>
              <div className="flex bg-slate-700 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                    type === "expense"
                      ? "bg-red-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                    type === "income"
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Income
                </button>
              </div>
            </div>

            {/* Category Dropdown */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {Object.entries(CATEGORY_MAP).map(([key, emoji]) => (
                  <option key={key} value={key}>
                    {emoji} {key.charAt(0).toUpperCase() + key.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Date</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Validation Error */}
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Saving…" : "Add Transaction"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
