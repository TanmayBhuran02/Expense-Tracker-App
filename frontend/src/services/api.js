import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export const api = axios.create({ baseURL: BASE_URL });

// ── Request interceptor: attach JWT ─────────────────────────────────────────
// SECURITY NOTE: JWT is stored in localStorage.
// XSS vs CSRF Trade-off:
// - Storing token in localStorage makes it susceptible to XSS (cross-site scripting) attacks
//   if an attacker is able to run arbitrary JS in the application context.
// - Alternatively, storing the token in a secure, httpOnly cookie protects it from XSS
//   but makes the application vulnerable to CSRF (cross-site request forgery) attacks,
//   which would require CSRF tokens / SameSite configuration.
// - Since this is an offline-first app relying on standard client-side API requests,
//   localStorage is chosen for simplicity and local client persistence, under the assumption
//   that strong Content Security Policy (CSP) and input sanitization protect against XSS.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: handle 401 with token refresh ─────────────────────
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401 errors, and only once per request
    if (error.response?.status === 401 && !originalRequest._retry) {
      const token = localStorage.getItem("access_token");

      // No token at all — skip refresh, go straight to login
      if (!token) {
        logout();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      // Don't retry refresh calls themselves
      if (originalRequest.url?.includes("/api/auth/refresh")) {
        logout();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // Use singleton promise so concurrent 401s share one refresh call
      if (!refreshPromise) {
        refreshPromise = api
          .post("/api/auth/refresh")
          .then(({ data }) => {
            localStorage.setItem("access_token", data.access_token);
            return data.access_token;
          })
          .catch((err) => {
            logout();
            window.location.href = "/login";
            throw err;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      try {
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth helpers ────────────────────────────────────────────────────────────

export async function login(email, password) {
  const { data } = await api.post("/api/auth/login", { email, password });
  localStorage.setItem("access_token", data.access_token);
  return data;
}

export async function register(email, password) {
  const { data } = await api.post("/api/auth/register", { email, password });
  localStorage.setItem("access_token", data.access_token);
  return data;
}

export function logout() {
  localStorage.removeItem("access_token");
}

export function isAuthenticated() {
  return !!localStorage.getItem("access_token");
}
