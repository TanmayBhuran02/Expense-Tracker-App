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
 *   deleted       — boolean soft-delete flag
 */
export const db = new Dexie("ExpenseTrackerDB");

// Upgrade schema to version 2 to support soft deletes (deleted flag) and custom categories
db.version(2).stores({
  transactions: "++id, client_uuid, sync_status, timestamp, deleted",
  meta: "key",
  categories: "++id, name",
});

// ── Helper: generate a UUID v4 without external deps ──────────────────────
export function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for insecure contexts (like HTTP on non-localhost IPs)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── CRUD helpers ───────────────────────────────────────────────────────────

export async function addTransaction({ amount, type, category, timestamp }) {
  try {
    return await db.transactions.add({
      client_uuid:  generateUUID(),
      amount:       parseFloat(amount),
      type,
      category,
      timestamp:    timestamp || new Date().toISOString(),
      sync_status:  "pending",   // will be pushed on next sync
      deleted:      false,
    });
  } catch (err) {
    throw new Error(`Failed to add transaction: ${err.message}`);
  }
}

export async function getAllTransactions() {
  try {
    const all = await db.transactions.orderBy("timestamp").reverse().toArray();
    return all.filter((t) => !t.deleted);
  } catch (err) {
    throw new Error(`Failed to retrieve transactions: ${err.message}`);
  }
}

export async function deleteTransaction(localId) {
  try {
    return await db.transactions.update(localId, {
      deleted:     true,
      sync_status: "pending",
    });
  } catch (err) {
    throw new Error(`Failed to soft-delete transaction: ${err.message}`);
  }
}

export async function getPendingTransactions() {
  try {
    return await db.transactions.where("sync_status").equals("pending").toArray();
  } catch (err) {
    throw new Error(`Failed to retrieve pending transactions: ${err.message}`);
  }
}

export async function markSynced(clientUuids) {
  try {
    return await db.transactions
      .where("client_uuid")
      .anyOf(clientUuids)
      .modify({ sync_status: "synced" });
  } catch (err) {
    throw new Error(`Failed to mark transactions as synced: ${err.message}`);
  }
}

export async function upsertFromServer(serverTxns) {
  try {
    for (const t of serverTxns) {
      const existing = await db.transactions
        .where("client_uuid").equals(t.client_uuid).first();
      if (existing) {
        await db.transactions.update(existing.id, { 
          ...t, 
          deleted: t.deleted || false,
          sync_status: "synced" 
        });
      } else {
        await db.transactions.add({ 
          ...t, 
          deleted: t.deleted || false,
          sync_status: "synced" 
        });
      }
    }
  } catch (err) {
    throw new Error(`Failed to upsert transactions from server: ${err.message}`);
  }
}

// ── Meta helpers (last sync timestamp) ────────────────────────────────────

export async function getLastSyncTimestamp() {
  try {
    const record = await db.meta.get("last_sync_timestamp");
    return record ? record.value : null;
  } catch (err) {
    throw new Error(`Failed to retrieve last sync timestamp: ${err.message}`);
  }
}

export async function setLastSyncTimestamp(ts) {
  try {
    return await db.meta.put({ key: "last_sync_timestamp", value: ts });
  } catch (err) {
    throw new Error(`Failed to set last sync timestamp: ${err.message}`);
  }
}

// ── Category helpers ───────────────────────────────────────────────────────

export async function addCustomCategory(name) {
  try {
    // Return the ID of the new category
    return await db.categories.add({ name });
  } catch (err) {
    throw new Error(`Failed to add custom category: ${err.message}`);
  }
}

export async function getCustomCategories() {
  try {
    return await db.categories.toArray();
  } catch (err) {
    throw new Error(`Failed to retrieve custom categories: ${err.message}`);
  }
}
