import { useState, useEffect } from "react";

/**
 * Returns true when the browser reports navigator.onLine === true.
 * Attaches to the window 'online' / 'offline' events so the component
 * that uses this hook re-renders whenever connectivity changes.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online",  on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return isOnline;
}
