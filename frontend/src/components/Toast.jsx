import { useState, useEffect, useCallback } from "react";

/**
 * Toast notification system.
 * Usage: <Toast message={msg} type="success|error|info" onDismiss={fn} />
 */

// Global toast state — shared via event emitter pattern
let toastListeners = [];
let toastDismissListeners = [];

export function showToast(message, type = "info", duration = 4000) {
  const id = Math.random().toString(36).substring(2, 9);
  toastListeners.forEach((fn) => fn({ message, type, duration, id }));
  return id;
}

export function dismissToast(id) {
  toastDismissListeners.forEach((fn) => fn(id));
}

export function useToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleAdd = (toast) => {
      setToasts((prev) => [...prev, toast]);
      if (toast.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, toast.duration);
      }
    };

    const handleDismiss = (id) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    toastListeners.push(handleAdd);
    toastDismissListeners.push(handleDismiss);

    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== handleAdd);
      toastDismissListeners = toastDismissListeners.filter((fn) => fn !== handleDismiss);
    };
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, dismiss };
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-md px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          role="alert"
          aria-live="assertive"
          className={`px-4 py-3 rounded-lg shadow-lg cursor-pointer text-sm font-medium transition-all duration-300 animate-slide-down
            ${toast.type === "success" ? "bg-emerald-600 text-white" : ""}
            ${toast.type === "error" ? "bg-red-600 text-white" : ""}
            ${toast.type === "info" ? "bg-blue-600 text-white" : ""}
          `}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
