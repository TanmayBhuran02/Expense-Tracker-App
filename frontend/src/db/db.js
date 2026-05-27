import Dexie from "dexie";

/**
 * Local IndexedDB schema via Dexie.
 *
 * transactions table:
 *   ++id          — auto-increment local primary key (never sent to server)
 *   client_uuid   — stable UUID generated on device; used as the sync key
 *   amount        — number (stored as float)
 *   type          — 'income' | 'expense'
 *   category      — string
 *   timestamp     — ISO string (user-facing creation time)
 *   sync_status   — 'pending' | 'synced'
 */
export const db = new Dexie("ExpenseTrackerDB");

db.version(1).stores({
  transactions: "++id, client_uuid, sync_status, timestamp",
  //            ^  primary key     ^ indexed fields for fast queries
  meta: "key",  // stores last_sync_timestamp and other app-level metadata
});

// ── Helper: generate a UUID v4 without external deps ──────────────────────
export function generateUUID() {
  return crypto.randomUUID();
}

// ── CRUD helpers ───────────────────────────────────────────────────────────

export async function addTransaction({ amount, type, category }) {
  return db.transactions.add({
    client_uuid:  generateUUID(),
    amount:       parseFloat(amount),
    type,
    category,
    timestamp:    new Date().toISOString(),
    sync_status:  "pending",   // will be pushed on next sync
  });
}

export async function getAllTransactions() {
  return db.transactions.orderBy("timestamp").reverse().toArray();
}

export async function deleteTransaction(localId) {
  // NOTE: soft-delete (tombstone) support should be added in Stage 2
  // before wiring delete through the sync endpoint.
  return db.transactions.delete(localId);
}

export async function getPendingTransactions() {
  return db.transactions.where("sync_status").equals("pending").toArray();
}

export async function markSynced(clientUuids) {
  return db.transactions
    .where("client_uuid")
    .anyOf(clientUuids)
    .modify({ sync_status: "synced" });
}

export async function upsertFromServer(serverTxns) {
  /**
   * For each transaction returned by the pull, either:
   *   - Insert it if we've never seen this client_uuid locally, or
   *   - Skip/update if we already have it (put() handles this via client_uuid).
   *
   * We do NOT use client_uuid as the Dexie primary key to avoid
   * complexity with Dexie's compound key limitations on older browsers.
   * Instead we query by client_uuid and replace.
   */
  for (const t of serverTxns) {
    const existing = await db.transactions
      .where("client_uuid").equals(t.client_uuid).first();
    if (existing) {
      await db.transactions.update(existing.id, { ...t, sync_status: "synced" });
    } else {
      await db.transactions.add({ ...t, sync_status: "synced" });
    }
  }
}

// ── Meta helpers (last sync timestamp) ────────────────────────────────────

export async function getLastSyncTimestamp() {
  const record = await db.meta.get("last_sync_timestamp");
  return record ? record.value : null;
}

export async function setLastSyncTimestamp(ts) {
  return db.meta.put({ key: "last_sync_timestamp", value: ts });
}
