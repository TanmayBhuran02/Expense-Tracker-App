import axios from "axios";

// ── Global Diagnostic Logs (For debugging connection/CORS issues) ────────────
window.__diagnosticLogs = window.__diagnosticLogs || [];
export function logDiagnostic(type, msg, data) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] [${type}] ${msg} ${data ? JSON.stringify(data) : ""}`;
  window.__diagnosticLogs.push(entry);
  if (window.__onDiagnosticLog) {
    try {
      window.__onDiagnosticLog(entry);
    } catch (e) {
      // ignore
    }
  }
  if (type === "ERROR") {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:5000`;

logDiagnostic("INFO", "Initialized API service", {
  BASE_URL,
  windowLocation: window.location.href,
  navigatorOnline: navigator.onLine,
});

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Send/receive httpOnly cookies automatically
});

// ── CSRF Token Handling ─────────────────────────────────────────────────────
// Flask-JWT-Extended sets a readable csrf_access_token cookie.
// We read it and attach it as X-CSRF-TOKEN header on mutating requests.

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_access_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Request interceptor: attach CSRF token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  const url = `${config.baseURL || ""}${config.url}`;
  logDiagnostic("REQUEST", `${method} ${url}`, {
    headers: { ...config.headers },
    data: config.data,
  });

  // Only mutating methods need CSRF protection
  const lowerMethod = (config.method || "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(lowerMethod)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers["X-CSRF-TOKEN"] = csrfToken;
    }
  }
  return config;
});

// ── Response interceptor: handle 401 with token refresh ─────────────────────
let refreshPromise = null;

api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase();
    const url = response.config.url;
    logDiagnostic("RESPONSE", `SUCCESS ${method} ${url}`, {
      status: response.status,
      data: response.data,
    });
    return response;
  },
  async (error) => {
    const method = error.config?.method?.toUpperCase();
    const url = error.config?.url;
    logDiagnostic("ERROR", `FAILED ${method} ${url}`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      code: error.code,
    });

    const originalRequest = error.config;

    // Only attempt refresh for 401 errors, and only once per request
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry refresh/logout/login/register calls themselves
      const skipPaths = ["/api/auth/refresh", "/api/auth/logout", "/api/auth/login", "/api/auth/register", "/api/auth/me"];
      if (skipPaths.some((p) => originalRequest.url?.includes(p))) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // Use singleton promise so concurrent 401s share one refresh call
      if (!refreshPromise) {
        logDiagnostic("INFO", "Initiating token refresh...");
        refreshPromise = api
          .post("/api/auth/refresh")
          .then(() => {
            logDiagnostic("INFO", "Token refresh successful");
            return true;
          })
          .catch((err) => {
            logDiagnostic("ERROR", "Token refresh failed. Redirecting to login.", {
              message: err.message,
            });
            // Refresh failed — session is truly expired
            clearAuthFlag();
            window.location.href = "/login";
            throw err;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      try {
        await refreshPromise;
        // Retry the original request — the new cookie is already set
        return api(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth helpers ────────────────────────────────────────────────────────────

// Lightweight UI flag — NOT security-critical.
// The real auth check is the httpOnly cookie validated server-side.
const AUTH_FLAG_KEY = "is_logged_in";

function setAuthFlag() {
  localStorage.setItem(AUTH_FLAG_KEY, "true");
}

function clearAuthFlag() {
  localStorage.removeItem(AUTH_FLAG_KEY);
}

export async function login(email, password) {
  const { data } = await api.post("/api/auth/login", { email, password });
  setAuthFlag();
  return data;
}

export async function register(email, password) {
  const { data } = await api.post("/api/auth/register", { email, password });
  setAuthFlag();
  return data;
}

export async function logout() {
  try {
    await api.post("/api/auth/logout");
  } catch {
    // Even if the server is unreachable, clear local state
  }
  clearAuthFlag();
}

/**
 * Lightweight synchronous check for UI routing decisions.
 * Returns true if the user has previously authenticated in this browser.
 * Does NOT guarantee the cookie is still valid — use checkAuthStatus() for that.
 */
export function isAuthenticated() {
  return localStorage.getItem(AUTH_FLAG_KEY) === "true";
}

/**
 * Server-side auth status check. Validates the httpOnly cookie with the server.
 * Use on app startup to reconcile the local flag with server reality.
 *
 * @returns {{ authenticated: boolean, user_id: number } | null}
 */
export async function checkAuthStatus() {
  try {
    const { data } = await api.get("/api/auth/me");
    setAuthFlag();
    return data;
  } catch {
    clearAuthFlag();
    return null;
  }
}

// ── Recurring Rules API ────────────────────────────────────────────────────

export async function getRecurringRules() {
  const { data } = await api.get("/api/recurring-rules/");
  return data;
}

export async function createRecurringRule(ruleData) {
  const { data } = await api.post("/api/recurring-rules/", ruleData);
  return data;
}

export async function updateRecurringRule(id, updates) {
  const { data } = await api.patch(`/api/recurring-rules/${id}`, updates);
  return data;
}

export async function deleteRecurringRule(id) {
  const { data } = await api.delete(`/api/recurring-rules/${id}`);
  return data;
}

// ── Splits API ─────────────────────────────────────────────────────────────

export async function getSplits() {
  const { data } = await api.get("/api/splits/");
  return data;
}

export async function createSplit(splitData) {
  const { data } = await api.post("/api/splits/", splitData);
  return data;
}

export async function settleSplitMember(splitId, memberId) {
  const { data } = await api.patch(`/api/splits/${splitId}/members/${memberId}`, {
    is_settled: true,
  });
  return data;
}
