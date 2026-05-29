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
 *   recurringRuleId — UUID of the recurring rule that generated this (optional)
 *
 * recurringRules table:
 *   id            — UUID primary key (same as server id)
 *   userId        — integer
 *   title         — string
 *   amount        — number
 *   category      — string
 *   frequency     — 'daily' | 'weekly' | 'monthly' | 'yearly'
 *   startDate     — ISO date string
 *   nextDue       — ISO date string
 *   endDate       — ISO date string or null
 *   isActive      — boolean
 *   syncStatus    — 'pending' | 'synced'
 *
 * splits table:
 *   id            — UUID primary key
 *   userId        — integer
 *   transactionClientUuid — UUID ref to transactions.client_uuid
 *   title         — string
 *   totalAmount   — number
 *   syncStatus    — 'pending' | 'synced'
 *
 * splitMembers table:
 *   id            — UUID primary key
 *   splitId       — UUID ref to splits.id
 *   name          — string
 *   shareAmount   — number
 *   isSettled     — boolean
 *   settledAt     — ISO string or null
 *   syncStatus    — 'pending' | 'synced'
 */
export const db = new Dexie("ExpenseTrackerDB");

// Upgrade schema to version 2 to support soft deletes (deleted flag) and custom categories
db.version(2).stores({
  transactions: "++id, client_uuid, sync_status, timestamp, deleted",
  meta: "key",
  categories: "++id, name",
});

// Version 3: add recurring rules, splits, and split members stores
db.version(3).stores({
  transactions: "++id, client_uuid, sync_status, timestamp, deleted, recurringRuleId",
  meta: "key",
  categories: "++id, name",
  recurringRules: "id, userId, nextDue, isActive, syncStatus",
  splits: "id, userId, transactionClientUuid, syncStatus",
  splitMembers: "id, splitId, isSettled, syncStatus",
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

// ── Transaction CRUD helpers ──────────────────────────────────────────────

export async function addTransaction({ amount, type, category, timestamp, recurringRuleId }) {
  try {
    return await db.transactions.add({
      client_uuid:     generateUUID(),
      amount:          parseFloat(amount),
      type,
      category,
      timestamp:       timestamp || new Date().toISOString(),
      sync_status:     "pending",   // will be pushed on next sync
      deleted:         false,
      recurringRuleId: recurringRuleId || null,
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
          recurringRuleId: t.recurring_rule_id || null,
          sync_status: "synced" 
        });
      } else {
        await db.transactions.add({ 
          ...t, 
          deleted: t.deleted || false,
          recurringRuleId: t.recurring_rule_id || null,
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

// ══════════════════════════════════════════════════════════════════════════
// Recurring Rules CRUD
// ══════════════════════════════════════════════════════════════════════════

export async function addRecurringRule({ id, title, amount, category, frequency, startDate, nextDue, endDate }) {
  try {
    const ruleId = id || generateUUID();
    return await db.recurringRules.put({
      id:         ruleId,
      userId:     null,  // populated by server; locally irrelevant
      title,
      amount:     parseFloat(amount),
      category:   category || null,
      frequency,
      startDate,
      nextDue:    nextDue || startDate,
      endDate:    endDate || null,
      isActive:   true,
      syncStatus: "pending",
    });
  } catch (err) {
    throw new Error(`Failed to add recurring rule: ${err.message}`);
  }
}

export async function getAllRecurringRules() {
  try {
    return await db.recurringRules.filter((r) => r.isActive).toArray();
  } catch (err) {
    throw new Error(`Failed to retrieve recurring rules: ${err.message}`);
  }
}

export async function updateRecurringRule(ruleId, updates) {
  try {
    const merged = { ...updates, syncStatus: "pending" };
    return await db.recurringRules.update(ruleId, merged);
  } catch (err) {
    throw new Error(`Failed to update recurring rule: ${err.message}`);
  }
}

export async function deleteRecurringRule(ruleId) {
  try {
    return await db.recurringRules.update(ruleId, {
      isActive:   false,
      syncStatus: "pending",
    });
  } catch (err) {
    throw new Error(`Failed to soft-delete recurring rule: ${err.message}`);
  }
}

export async function getDueRecurringRules() {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const all = await db.recurringRules.toArray();
    return all.filter((r) => r.isActive && r.nextDue <= today);
  } catch (err) {
    throw new Error(`Failed to get due recurring rules: ${err.message}`);
  }
}

export async function getPendingRecurringRules() {
  try {
    return await db.recurringRules.where("syncStatus").equals("pending").toArray();
  } catch (err) {
    throw new Error(`Failed to retrieve pending recurring rules: ${err.message}`);
  }
}

export async function markRecurringRulesSynced(ruleIds) {
  try {
    for (const id of ruleIds) {
      await db.recurringRules.update(id, { syncStatus: "synced" });
    }
  } catch (err) {
    throw new Error(`Failed to mark recurring rules as synced: ${err.message}`);
  }
}

export async function upsertRecurringRulesFromServer(serverRules) {
  try {
    for (const r of serverRules) {
      const existing = await db.recurringRules.get(r.id);
      if (existing) {
        await db.recurringRules.update(r.id, {
          title:      r.title,
          amount:     r.amount,
          category:   r.category,
          frequency:  r.frequency,
          startDate:  r.start_date,
          nextDue:    r.next_due,
          endDate:    r.end_date,
          isActive:   r.is_active,
          syncStatus: "synced",
        });
      } else {
        await db.recurringRules.put({
          id:         r.id,
          userId:     r.user_id,
          title:      r.title,
          amount:     r.amount,
          category:   r.category,
          frequency:  r.frequency,
          startDate:  r.start_date,
          nextDue:    r.next_due,
          endDate:    r.end_date,
          isActive:   r.is_active,
          syncStatus: "synced",
        });
      }
    }
  } catch (err) {
    throw new Error(`Failed to upsert recurring rules from server: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Splits + SplitMembers CRUD
// ══════════════════════════════════════════════════════════════════════════

export async function addSplit({ id, transactionClientUuid, title, totalAmount, members }) {
  try {
    const splitId = id || generateUUID();
    await db.splits.put({
      id:                     splitId,
      userId:                 null,
      transactionClientUuid,
      title,
      totalAmount:            parseFloat(totalAmount),
      syncStatus:             "pending",
    });

    // Add members
    for (const m of members) {
      await db.splitMembers.put({
        id:          m.id || generateUUID(),
        splitId,
        name:        m.name,
        shareAmount: parseFloat(m.shareAmount),
        isSettled:   false,
        settledAt:   null,
        syncStatus:  "pending",
      });
    }

    return splitId;
  } catch (err) {
    throw new Error(`Failed to add split: ${err.message}`);
  }
}

export async function getAllSplits() {
  try {
    const splits = await db.splits.toArray();
    const result = [];
    for (const s of splits) {
      const members = await db.splitMembers.where("splitId").equals(s.id).toArray();
      result.push({ ...s, members });
    }
    return result;
  } catch (err) {
    throw new Error(`Failed to retrieve splits: ${err.message}`);
  }
}

export async function updateSplitMember(memberId, updates) {
  try {
    const merged = { ...updates, syncStatus: "pending" };
    return await db.splitMembers.update(memberId, merged);
  } catch (err) {
    throw new Error(`Failed to update split member: ${err.message}`);
  }
}

export async function getPendingSplits() {
  try {
    const pendingSplits = await db.splits.where("syncStatus").equals("pending").toArray();
    const result = [];
    for (const s of pendingSplits) {
      const members = await db.splitMembers.where("splitId").equals(s.id).toArray();
      result.push({
        id:             s.id,
        transaction_id: s.transactionClientUuid,
        title:          s.title,
        total_amount:   s.totalAmount,
        members:        members.map((m) => ({
          id:           m.id,
          name:         m.name,
          share_amount: m.shareAmount,
          is_settled:   m.isSettled,
        })),
      });
    }
    return result;
  } catch (err) {
    throw new Error(`Failed to retrieve pending splits: ${err.message}`);
  }
}

export async function markSplitsSynced(splitIds) {
  try {
    for (const id of splitIds) {
      await db.splits.update(id, { syncStatus: "synced" });
      await db.splitMembers.where("splitId").equals(id).modify({ syncStatus: "synced" });
    }
  } catch (err) {
    throw new Error(`Failed to mark splits as synced: ${err.message}`);
  }
}

export async function upsertSplitsFromServer(serverSplits) {
  try {
    for (const s of serverSplits) {
      const existing = await db.splits.get(s.id);
      if (existing) {
        await db.splits.update(s.id, {
          title:                  s.title,
          totalAmount:            s.total_amount,
          transactionClientUuid:  s.transaction_id,
          syncStatus:             "synced",
        });
      } else {
        await db.splits.put({
          id:                     s.id,
          userId:                 s.user_id,
          transactionClientUuid:  s.transaction_id,
          title:                  s.title,
          totalAmount:            s.total_amount,
          syncStatus:             "synced",
        });
      }

      // Upsert members
      for (const m of (s.members || [])) {
        const existingMember = await db.splitMembers.get(m.id);
        if (existingMember) {
          await db.splitMembers.update(m.id, {
            name:        m.name,
            shareAmount: m.share_amount,
            isSettled:   m.is_settled,
            settledAt:   m.settled_at,
            syncStatus:  "synced",
          });
        } else {
          await db.splitMembers.put({
            id:          m.id,
            splitId:     m.split_id,
            name:        m.name,
            shareAmount: m.share_amount,
            isSettled:   m.is_settled,
            settledAt:   m.settled_at,
            syncStatus:  "synced",
          });
        }
      }
    }
  } catch (err) {
    throw new Error(`Failed to upsert splits from server: ${err.message}`);
  }
}
