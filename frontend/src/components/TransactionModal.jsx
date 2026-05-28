import { useState, useEffect } from "react";
import { addTransaction, addCustomCategory, getCustomCategories } from "../db/db";
import { runSync } from "../services/syncService";
import { isAuthenticated } from "../services/api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { showToast } from "./Toast";
import { logger } from "../utils/logger";

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

  // Custom category fields
  const [customCategories, setCustomCategories] = useState([]);
  const [newCustomCategoryName, setNewCustomCategoryName] = useState("");
  const [showAddCustomInput, setShowAddCustomInput] = useState(false);

  // Fetch custom categories from Dexie when modal opens
  useEffect(() => {
    if (isOpen) {
      getCustomCategories()
        .then((cats) => setCustomCategories(cats))
        .catch((err) => logger.error("Failed to load custom categories:", err));
    }
  }, [isOpen]);

  const validate = () => {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      return "Amount must be greater than 0";
    }
    const intPart = Math.floor(num).toString();
    if (intPart.length > 10) {
      return "Amount is too large (max 10 digits)";
    }
    if (!date) {
      return "Please select a date";
    }
    return "";
  };

  const handleCategoryChange = (e) => {
    const val = e.target.value;
    if (val === "add_custom") {
      setShowAddCustomInput(true);
    } else {
      setCategory(val);
      setShowAddCustomInput(false);
    }
  };

  const handleSaveCustomCategory = async () => {
    const name = newCustomCategoryName.trim().toLowerCase();
    if (!name) return;
    
    // Check if duplicate
    const isDuplicate = 
      CATEGORY_MAP[name] !== undefined || 
      customCategories.some((cat) => cat.name === name);
      
    if (isDuplicate) {
      showToast(`Category "${name}" already exists`, "error");
      return;
    }

    try {
      await addCustomCategory(name);
      const updated = await getCustomCategories();
      setCustomCategories(updated);
      setCategory(name);
      setNewCustomCategoryName("");
      setShowAddCustomInput(false);
      showToast(`Added custom category: ${name}`, "success");
    } catch (err) {
      showToast(`Failed to add category: ${err.message}`, "error");
    }
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
      logger.error("Transaction save error:", err);
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

      {/* Responsive bottom-sheet (mobile) / modal container (desktop) */}
      <div
        className="fixed bottom-0 left-0 right-0 w-full bg-slate-800 rounded-t-2xl shadow-2xl p-6 z-50 animate-slide-up
                   md:absolute md:top-1/2 md:left-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:max-w-lg md:w-full"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Add Transaction</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Amount (Tab Index 1) */}
          <div>
            <label htmlFor="amount-input" className="text-sm text-slate-400 mb-1 block">Amount</label>
            <input
              id="amount-input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white text-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              tabIndex={1}
              autoFocus
            />
          </div>

          {/* Type Toggle (Tab Index 2) */}
          <div>
            <span className="text-sm text-slate-400 mb-1 block">Type</span>
            <div className="flex bg-slate-700 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setType("expense")}
                tabIndex={2}
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
                tabIndex={2}
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

          {/* Category Dropdown (Tab Index 3) */}
          <div>
            <label htmlFor="category-select" className="text-sm text-slate-400 mb-1 block">Category</label>
            <select
              id="category-select"
              value={showAddCustomInput ? "add_custom" : category}
              onChange={handleCategoryChange}
              tabIndex={3}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {/* Hardcoded system categories */}
              {Object.entries(CATEGORY_MAP).map(([key, emoji]) => (
                <option key={key} value={key}>
                  {emoji} {key.charAt(0).toUpperCase() + key.slice(1)}
                </option>
              ))}
              
              {/* Custom categories loaded from Dexie */}
              {customCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  📦 {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
                </option>
              ))}
              
              {/* Option to trigger custom category creation */}
              <option value="add_custom" className="text-blue-400 font-semibold">
                ➕ Add Custom Category...
              </option>
            </select>

            {/* Input field for adding a custom category */}
            {showAddCustomInput && (
              <div className="mt-3 flex gap-2 animate-slide-down">
                <input
                  type="text"
                  placeholder="New category name"
                  value={newCustomCategoryName}
                  onChange={(e) => setNewCustomCategoryName(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveCustomCategory}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCustomInput(false)}
                  className="bg-slate-600 hover:bg-slate-500 px-3 py-2 rounded-lg text-sm text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Date (Tab Index 4) */}
          <div>
            <label htmlFor="date-input" className="text-sm text-slate-400 mb-1 block">Date</label>
            <input
              id="date-input"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              tabIndex={4}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Validation Error */}
          {error && (
            <p className="text-red-400 text-sm" role="alert">{error}</p>
          )}

          {/* Submit (Tab Index 5) */}
          <button
            type="submit"
            disabled={isSubmitting}
            tabIndex={5}
            className="w-full py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Saving…" : "Add Transaction"}
          </button>
        </form>
      </div>
    </>
  );
}
