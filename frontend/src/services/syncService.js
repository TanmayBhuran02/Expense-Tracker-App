import { api } from "./api";
import {
  getPendingTransactions,
  markSynced,
  upsertFromServer,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from "../db/db";

/**
 * runSync()
 *
 * Called automatically when the app detects an online event,
 * and can also be triggered manually by the user.
 *
 * Flow:
 *   1. Read all local 'pending' transactions.
 *   2. Read last_sync_timestamp from local meta table.
 *   3. POST /api/sync  with pending transactions + last_sync_timestamp.
 *   4. On success:
 *      a. Mark pushed transactions as 'synced' locally.
 *      b. Upsert server-returned transactions into local DB.
 *      c. Store the new server_timestamp for the next sync.
 *
 * @returns {{ pushed: number, pulled: number }} sync summary
 */
export async function runSync() {
  const pending        = await getPendingTransactions();
  const lastSyncTs     = await getLastSyncTimestamp();

  const payload = {
    last_sync_timestamp: lastSyncTs,
    transactions: pending.map(({ client_uuid, amount, type, category, timestamp }) => ({
      client_uuid, amount, type, category, timestamp,
    })),
  };

  const { data } = await api.post("/api/sync", payload);

  // Mark locally-pushed records as synced
  if (pending.length > 0) {
    await markSynced(pending.map((t) => t.client_uuid));
  }

  // Upsert records the server sent back (new from other devices, etc.)
  if (data.server_transactions?.length > 0) {
    await upsertFromServer(data.server_transactions);
  }

  // Advance the sync cursor so next pull only fetches newer records
  await setLastSyncTimestamp(data.server_timestamp);

  return {
    pushed: pending.length,
    pulled: data.server_transactions?.length ?? 0,
  };
}
