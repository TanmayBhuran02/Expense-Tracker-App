import { api } from "./api";
import {
  getPendingTransactions,
  markSynced,
  upsertFromServer,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  getPendingRecurringRules,
  markRecurringRulesSynced,
  upsertRecurringRulesFromServer,
  getPendingSplits,
  markSplitsSynced,
  upsertSplitsFromServer,
} from "../db/db";

/**
 * runSync()
 *
 * Called automatically when the app detects an online event,
 * and can also be triggered manually by the user.
 *
 * Flow:
 *   1. Read all local 'pending' transactions, recurring rules, and splits.
 *   2. Read last_sync_timestamp from local meta table.
 *   3. POST /api/sync  with pending data + last_sync_timestamp.
 *   4. On success:
 *      a. Mark pushed items as 'synced' locally.
 *      b. Upsert server-returned items into local DB.
 *      c. Store the new server_timestamp for the next sync.
 *
 * @returns {{ pushed: number, pulled: number }} sync summary
 */
export async function runSync() {
  try {
    const pending          = await getPendingTransactions();
    const pendingRules     = await getPendingRecurringRules();
    const pendingSplits    = await getPendingSplits();
    const lastSyncTs       = await getLastSyncTimestamp();

    const payload = {
      last_sync_timestamp: lastSyncTs,
      transactions: pending.map(({ client_uuid, amount, type, category, timestamp, deleted, recurringRuleId }) => ({
        client_uuid,
        amount: parseFloat(amount),
        type,
        category,
        timestamp,
        deleted: !!deleted,
        recurring_rule_id: recurringRuleId || null,
      })),
      recurring_rules: pendingRules.map((r) => ({
        id:         r.id,
        title:      r.title,
        amount:     r.amount,
        category:   r.category,
        frequency:  r.frequency,
        start_date: r.startDate,
        next_due:   r.nextDue,
        end_date:   r.endDate,
        is_active:  r.isActive,
      })),
      splits: pendingSplits,
    };

    let response;
    try {
      response = await api.post("/api/sync", payload);
    } catch (err) {
      const serverMsg = err.response?.data?.error || err.message;
      throw new Error(`Server sync failed: ${serverMsg}`);
    }

    const { data } = response;

    // Mark locally-pushed records as synced
    if (pending.length > 0) {
      await markSynced(pending.map((t) => t.client_uuid));
    }

    if (pendingRules.length > 0) {
      await markRecurringRulesSynced(pendingRules.map((r) => r.id));
    }

    if (pendingSplits.length > 0) {
      await markSplitsSynced(pendingSplits.map((s) => s.id));
    }

    // Upsert records the server sent back (new from other devices, etc.)
    if (data.server_transactions?.length > 0) {
      await upsertFromServer(data.server_transactions);
    }

    if (data.server_recurring_rules?.length > 0) {
      await upsertRecurringRulesFromServer(data.server_recurring_rules);
    }

    if (data.server_splits?.length > 0) {
      await upsertSplitsFromServer(data.server_splits);
    }

    // Advance the sync cursor so next pull only fetches newer records
    await setLastSyncTimestamp(data.server_timestamp);

    return {
      pushed: pending.length + pendingRules.length + pendingSplits.length,
      pulled: (data.server_transactions?.length ?? 0) +
              (data.server_recurring_rules?.length ?? 0) +
              (data.server_splits?.length ?? 0),
    };
  } catch (err) {
    throw new Error(`Sync failed: ${err.message}`);
  }
}
