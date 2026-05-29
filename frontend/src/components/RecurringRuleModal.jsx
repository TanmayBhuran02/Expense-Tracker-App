import { useState, useEffect } from "react";
import { addRecurringRule, getCustomCategories } from "../db/db";
import { createRecurringRule } from "../services/api";
import { isAuthenticated } from "../services/api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { showToast } from "./Toast";
import { logger } from "../utils/logger";
import { CATEGORY_MAP } from "./TransactionModal";

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/**
 * RecurringRuleModal — create a recurring transaction rule.
 * Saves to Dexie first (offline-first), then fires API if online.
 */
export default function RecurringRuleModal({ isOpen, onClose, onRuleAdded }) {
  const isOnline = useOnlineStatus();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);

  useEffect(() => {
    if (isOpen) {
      getCustomCategories()
        .then((cats) => setCustomCategories(cats))
        .catch((err) => logger.error("Failed to load custom categories:", err));
    }
  }, [isOpen]);

  const validate = () => {
    if (!title.trim()) return "Title is required";
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) return "Amount must be greater than 0";
    if (!startDate) return "Start date is required";
    if (endDate && endDate < startDate) return "End date must be after start date";
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
      const ruleData = {
        title: title.trim(),
        amount: Math.round(parseFloat(amount) * 100) / 100,
        category,
        frequency,
        startDate,
        nextDue: startDate,
        endDate: endDate || null,
      };

      // Save to Dexie first (offline-first)
      await addRecurringRule(ruleData);

      // Fire API call if online
      if (isOnline && isAuthenticated()) {
        createRecurringRule({
          title: ruleData.title,
          amount: ruleData.amount,
          category: ruleData.category,
          frequency: ruleData.frequency,
          start_date: ruleData.startDate,
          next_due: ruleData.nextDue,
          end_date: ruleData.endDate,
        }).catch((err) => {
          logger.error("API recurring rule creation failed (will sync later):", err);
        });
      }

      showToast("Recurring rule created!", "success");

      // Reset form
      setTitle("");
      setAmount("");
      setCategory("food");
      setFrequency("monthly");
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      onClose();
      if (onRuleAdded) onRuleAdded();
    } catch (err) {
      logger.error("Recurring rule save error:", err);
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
      <div
        className="fixed bottom-0 left-0 right-0 w-full bg-slate-800 rounded-t-2xl shadow-2xl p-6 z-50 animate-slide-up
                   md:absolute md:top-1/2 md:left-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:max-w-lg md:w-full"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">New Recurring Rule</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label htmlFor="rule-title" className="text-sm text-slate-400 mb-1 block">Title</label>
            <input
              id="rule-title"
              type="text"
              placeholder="e.g. Netflix, Rent, Gym"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="rule-amount" className="text-sm text-slate-400 mb-1 block">Amount</label>
            <input
              id="rule-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white text-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="rule-category" className="text-sm text-slate-400 mb-1 block">Category</label>
            <select
              id="rule-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {Object.entries(CATEGORY_MAP).map(([key, emoji]) => (
                <option key={key} value={key}>
                  {emoji} {key.charAt(0).toUpperCase() + key.slice(1)}
                </option>
              ))}
              {customCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  📦 {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label htmlFor="rule-frequency" className="text-sm text-slate-400 mb-1 block">Frequency</label>
            <select
              id="rule-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label htmlFor="rule-start-date" className="text-sm text-slate-400 mb-1 block">Start Date</label>
            <input
              id="rule-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* End Date (optional) */}
          <div>
            <label htmlFor="rule-end-date" className="text-sm text-slate-400 mb-1 block">End Date (optional)</label>
            <input
              id="rule-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Validation Error */}
          {error && (
            <p className="text-red-400 text-sm" role="alert">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Saving…" : "Create Rule"}
          </button>
        </form>
      </div>
    </>
  );
}
