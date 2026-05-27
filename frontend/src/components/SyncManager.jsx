import { useEffect, useRef } from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { isAuthenticated } from "../services/api";
import { runSync } from "../services/syncService";
import { showToast } from "./Toast";

/**
 * SyncManager — top-level component that manages automatic sync lifecycle.
 *
 * - Calls runSync() once on mount if online + authenticated.
 * - Calls runSync() whenever isOnline flips from false → true (debounced 2s).
 * - Gates sync behind isAuthenticated().
 * - Uses a ref flag to prevent concurrent sync calls.
 */
export default function SyncManager({ children }) {
  const isOnline = useOnlineStatus();
  const prevOnlineRef = useRef(isOnline);
  const syncInFlightRef = useRef(false);
  const debounceTimerRef = useRef(null);

  const doSync = async () => {
    if (!isAuthenticated() || syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    showToast("Syncing…", "info", 0); // persistent until replaced

    try {
      const result = await runSync();
      showToast(`Synced ✓ — pushed ${result.pushed}, pulled ${result.pulled}`, "success");
    } catch (err) {
      const msg = err.response?.status === 401
        ? "Session expired — please log in again"
        : `Sync failed: ${err.message}`;
      showToast(msg, "error");
    } finally {
      syncInFlightRef.current = false;
    }
  };

  // Sync once on mount if already online + authenticated
  useEffect(() => {
    if (isOnline && isAuthenticated()) {
      doSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when transitioning from offline → online (debounced 2s)
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (isOnline && wasOffline && isAuthenticated()) {
      // Clear any existing debounce timer
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        doSync();
      }, 2000);
    }

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return <>{children}</>;
}
