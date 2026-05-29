import { useState, useEffect, useCallback } from "react";
import { generateUUID } from "../db/db";
import { logger } from "../utils/logger";

/**
 * SplitForm — embedded inside TransactionModal behind a "Split this expense" toggle.
 * - Default: divides total equally among participants
 * - Manual override per row; validates sum of shares === total
 * - Dynamic add/remove participant rows
 *
 * Props:
 *   totalAmount — the transaction amount to split
 *   onSplitDataChange(splitData | null) — called whenever split data changes
 *   enabled — whether the split toggle is on
 *   onToggle — callback to toggle split mode
 */
export default function SplitForm({ totalAmount, onSplitDataChange, enabled, onToggle }) {
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState([
    { id: generateUUID(), name: "", shareAmount: "" },
    { id: generateUUID(), name: "", shareAmount: "" },
  ]);
  const [isManualMode, setIsManualMode] = useState(false);
  const [validationError, setValidationError] = useState("");

  // Recalculate equal splits when total or member count changes
  const recalculateEqual = useCallback(() => {
    if (isManualMode || members.length === 0) return;
    const total = parseFloat(totalAmount) || 0;
    const perPerson = Math.round((total / members.length) * 100) / 100;
    // Distribute rounding remainder to the last person
    const remainder = Math.round((total - perPerson * members.length) * 100) / 100;

    setMembers((prev) =>
      prev.map((m, i) => ({
        ...m,
        shareAmount: (i === prev.length - 1 ? perPerson + remainder : perPerson).toFixed(2),
      }))
    );
  }, [totalAmount, members.length, isManualMode]);

  useEffect(() => {
    if (enabled && !isManualMode) {
      recalculateEqual();
    }
  }, [enabled, recalculateEqual, isManualMode]);

  // Notify parent whenever split data changes
  useEffect(() => {
    if (!enabled) {
      onSplitDataChange(null);
      return;
    }

    const total = parseFloat(totalAmount) || 0;
    const shareSum = members.reduce((sum, m) => sum + (parseFloat(m.shareAmount) || 0), 0);
    const roundedSum = Math.round(shareSum * 100) / 100;
    const roundedTotal = Math.round(total * 100) / 100;

    if (Math.abs(roundedSum - roundedTotal) > 0.01 && isManualMode) {
      setValidationError(`Shares total $${roundedSum.toFixed(2)} ≠ expense $${roundedTotal.toFixed(2)}`);
    } else {
      setValidationError("");
    }

    const hasEmptyNames = members.some((m) => !m.name.trim());
    const allValid = !hasEmptyNames && Math.abs(roundedSum - roundedTotal) <= 0.01 && title.trim();

    onSplitDataChange(allValid ? {
      title: title.trim(),
      totalAmount: roundedTotal,
      members: members.map((m) => ({
        id: m.id,
        name: m.name.trim(),
        shareAmount: parseFloat(m.shareAmount),
      })),
    } : null);
  }, [enabled, title, members, totalAmount, isManualMode, onSplitDataChange]);

  const addMember = () => {
    setMembers((prev) => [...prev, { id: generateUUID(), name: "", shareAmount: "" }]);
  };

  const removeMember = (idx) => {
    if (members.length <= 2) return; // Minimum 2 members
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMember = (idx, field, value) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
    if (field === "shareAmount") {
      setIsManualMode(true);
    }
  };

  const resetToEqual = () => {
    setIsManualMode(false);
  };

  if (!enabled) {
    return (
      <div className="border border-dashed border-slate-600 rounded-lg p-3">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors"
        >
          <span>✂️</span>
          <span>Split this expense</span>
        </button>
      </div>
    );
  }

  return (
    <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-950/20 space-y-3 animate-slide-down">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-blue-400 flex items-center gap-1.5">
          <span>✂️</span> Split Expense
        </h3>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-slate-400 hover:text-red-400 transition-colors"
        >
          Remove Split
        </button>
      </div>

      {/* Split Title */}
      <div>
        <label htmlFor="split-title" className="text-xs text-slate-400 mb-1 block">Split Title</label>
        <input
          id="split-title"
          type="text"
          placeholder="e.g. Dinner at Mario's"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 rounded-lg bg-slate-700 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Members */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Participants</span>
          <div className="flex gap-2">
            {isManualMode && (
              <button
                type="button"
                onClick={resetToEqual}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Reset to equal
              </button>
            )}
          </div>
        </div>

        {members.map((m, idx) => (
          <div key={m.id} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Name"
              value={m.name}
              onChange={(e) => updateMember(idx, "name", e.target.value)}
              className="flex-1 p-2 rounded-lg bg-slate-700 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <div className="relative w-24">
              <span className="absolute inset-y-0 left-2 flex items-center text-slate-400 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={m.shareAmount}
                onChange={(e) => updateMember(idx, "shareAmount", e.target.value)}
                className="w-full p-2 pl-5 rounded-lg bg-slate-700 text-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {members.length > 2 && (
              <button
                type="button"
                onClick={() => removeMember(idx)}
                className="text-slate-400 hover:text-red-400 text-lg leading-none transition-colors"
                aria-label={`Remove ${m.name || 'participant'}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Participant */}
      <button
        type="button"
        onClick={addMember}
        className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 border border-dashed border-slate-600 rounded-lg hover:border-blue-500/50 transition-all"
      >
        + Add Participant
      </button>

      {/* Validation Error */}
      {validationError && (
        <p className="text-amber-400 text-xs" role="alert">⚠️ {validationError}</p>
      )}
    </div>
  );
}
