import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, updateSplitMember } from "../db/db";
import { settleSplitMember, isAuthenticated } from "../services/api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { showToast } from "./Toast";
import { logger } from "../utils/logger";

/**
 * SplitSummaryCard — dashboard card listing open splits.
 * Each row shows participant name, amount owed, and a "Mark settled" button.
 * Settled rows are greyed out.
 */
export default function SplitSummaryCard() {
  const isOnline = useOnlineStatus();
  const [expandedSplitId, setExpandedSplitId] = useState(null);

  // Live query: all splits with their members
  const splits = useLiveQuery(async () => {
    const allSplits = await db.splits.toArray();
    const result = [];
    for (const s of allSplits) {
      const members = await db.splitMembers.where("splitId").equals(s.id).toArray();
      result.push({ ...s, members });
    }
    return result;
  });

  if (splits === undefined) return null; // Loading
  if (splits.length === 0) return null;  // No splits — don't render card

  // Count open (unsettled) member entries across all splits
  const openCount = splits.reduce(
    (sum, s) => sum + s.members.filter((m) => !m.isSettled).length,
    0
  );

  const handleSettle = async (split, member) => {
    try {
      await updateSplitMember(member.id, {
        isSettled: true,
        settledAt: new Date().toISOString(),
      });
      showToast(`${member.name} marked as settled`, "success");

      // Fire API if online
      if (isOnline && isAuthenticated()) {
        settleSplitMember(split.id, member.id).catch((err) => {
          logger.error("API settle failed (will sync later):", err);
        });
      }
    } catch (err) {
      logger.error("Failed to settle member:", err);
      showToast(`Failed to settle: ${err.message}`, "error");
    }
  };

  const toggleExpand = (splitId) => {
    setExpandedSplitId((prev) => (prev === splitId ? null : splitId));
  };

  return (
    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/50 flex justify-between items-center">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span aria-hidden="true">✂️</span>
          Split Expenses
        </h2>
        {openCount > 0 && (
          <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-1 rounded-full">
            {openCount} open
          </span>
        )}
      </div>

      {/* Splits List */}
      <div className="divide-y divide-slate-700/50">
        {splits.map((split) => {
          const isExpanded = expandedSplitId === split.id;
          const unsettledCount = split.members.filter((m) => !m.isSettled).length;
          const totalOwed = split.members
            .filter((m) => !m.isSettled)
            .reduce((sum, m) => sum + parseFloat(m.shareAmount), 0);

          return (
            <div key={split.id}>
              {/* Split Header Row */}
              <button
                onClick={() => toggleExpand(split.id)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-750 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{split.title}</p>
                  <p className="text-xs text-slate-400">
                    ${parseFloat(split.totalAmount).toFixed(2)} total • {unsettledCount} unsettled
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {unsettledCount > 0 && (
                    <span className="text-amber-400 text-sm font-bold">
                      ${totalOwed.toFixed(2)}
                    </span>
                  )}
                  <span className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </div>
              </button>

              {/* Expanded Members */}
              {isExpanded && (
                <div className="px-5 pb-3 space-y-2 animate-slide-down">
                  {split.members.map((member) => (
                    <div
                      key={member.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        member.isSettled
                          ? "bg-slate-700/30 opacity-50"
                          : "bg-slate-700/60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${member.isSettled ? "line-through text-slate-500" : ""}`}>
                            {member.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            ${parseFloat(member.shareAmount).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {member.isSettled ? (
                        <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                          ✓ Settled
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSettle(split, member)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                        >
                          Mark Settled
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
