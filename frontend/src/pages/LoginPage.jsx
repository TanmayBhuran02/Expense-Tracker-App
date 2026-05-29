import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, register, logDiagnostic, api } from "../services/api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

// ── Validation helpers ──────────────────────────────────────────────────────
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function validateEmail(email) {
  if (!email.trim()) return "Email is required";
  if (!EMAIL_RE.test(email.trim())) return "Please enter a valid email address";
  return null;
}

function validatePassword(password) {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

// ── Component ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  // Diagnostics logs state
  const [logs, setLogs] = useState([]);
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  useEffect(() => {
    // Set initial logs
    setLogs([...(window.__diagnosticLogs || [])]);
    // Subscribe to new logs
    window.__onDiagnosticLog = (entry) => {
      setLogs([...(window.__diagnosticLogs || [])]);
    };
    return () => {
      window.__onDiagnosticLog = null;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    logDiagnostic("INFO", `Submitting authentication form (isRegistering=${isRegistering})`, {
      email: email.trim().toLowerCase(),
      isOnline,
      windowOnline: navigator.onLine,
    });

    // Client-side validation
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);
    if (emailErr || passErr) {
      setFieldErrors({ email: emailErr, password: passErr });
      return;
    }
    setFieldErrors({});

    // Network check
    if (!isOnline) {
      setError("You are offline. Please connect to the internet to log in.");
      return;
    }

    setIsLoading(true);
    try {
      if (isRegistering) {
        await register(email.trim().toLowerCase(), password);
      } else {
        await login(email.trim().toLowerCase(), password);
      }
      navigate("/dashboard");
      window.location.reload(); // Reload to refresh auth state in App
    } catch (err) {
      console.error("[Auth Error]", err);
      console.error("[Auth Error] response:", err.response);
      console.error("[Auth Error] message:", err.message);

      const status = err.response?.status;
      const serverMsg = err.response?.data?.error;

      if (status === 409) {
        setError("This email is already registered. Try logging in instead.");
      } else if (status === 401) {
        setError("Invalid email or password. Please try again.");
      } else if (status === 400) {
        setError(serverMsg || "Please check your input and try again.");
      } else if (!navigator.onLine) {
        setError("Connection lost. Please check your internet and try again.");
      } else if (err.code === "ERR_NETWORK" || !err.response) {
        setError(`Cannot reach the server. Check that the backend is running. (${err.message})`);
      } else {
        setError(serverMsg || `An unexpected error occurred: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="bg-slate-800 p-8 rounded-xl shadow-xl w-full max-w-md border border-slate-700/50">
        <h2 className="text-2xl font-bold mb-6 text-center">
          {isRegistering ? "Create Account" : "Welcome Back"}
        </h2>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="mb-4 p-3 rounded-lg bg-amber-950/50 border border-amber-700/50 text-amber-300 text-sm flex items-center gap-2">
            <span aria-hidden="true">📡</span>
            <span>You're offline — log in requires an internet connection.</span>
          </div>
        )}

        {/* Global Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <input
              type="email"
              placeholder="Email"
              className={`w-full p-3 rounded-lg bg-slate-700 text-white placeholder-slate-400 border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                fieldErrors.email ? "border-red-500" : "border-slate-600"
              }`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: null }));
              }}
              disabled={isLoading}
              autoComplete="email"
              aria-label="Email address"
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-sm text-red-400">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <input
              type="password"
              placeholder="Password"
              className={`w-full p-3 rounded-lg bg-slate-700 text-white placeholder-slate-400 border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                fieldErrors.password ? "border-red-500" : "border-slate-600"
              }`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: null }));
              }}
              disabled={isLoading}
              autoComplete={isRegistering ? "new-password" : "current-password"}
              aria-label="Password"
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-sm text-red-400">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !isOnline}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 p-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {isLoading && (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isLoading
              ? isRegistering ? "Creating Account…" : "Logging In…"
              : isRegistering ? "Create Account" : "Log In"}
          </button>
        </form>

        <button
          className="mt-4 text-sm text-slate-400 hover:text-white transition-colors w-full text-center"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError(null);
            setFieldErrors({});
          }}
          disabled={isLoading}
        >
          {isRegistering ? "Already have an account? Log in" : "Need an account? Register"}
        </button>

        {/* Diagnostics Log Console */}
        <div className="mt-6 border-t border-slate-700/60 pt-4 text-left font-sans">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-white transition-colors focus:outline-none"
          >
            <span>💻 DIAGNOSTIC LOGS</span>
            <span>{showDiagnostics ? "Hide" : "Show"}</span>
          </button>

          {showDiagnostics && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-1 text-[10px] text-slate-500 font-mono">
                <span className="truncate max-w-[280px]">API: {api.defaults?.baseURL || "Unknown"}</span>
                <button
                  type="button"
                  onClick={() => {
                    window.__diagnosticLogs = [];
                    setLogs([]);
                  }}
                  className="text-blue-400 hover:text-blue-300 hover:underline flex-shrink-0"
                >
                  Clear
                </button>
              </div>
              <div className="bg-slate-900 border border-slate-950 p-3 rounded-lg h-48 overflow-y-auto font-mono text-[11px] leading-relaxed flex flex-col gap-1 shadow-inner scrollbar-thin scrollbar-thumb-slate-800">
                {logs.length === 0 ? (
                  <span className="text-slate-500 italic">No logs captured yet. Attempt login/register to diagnose.</span>
                ) : (
                  logs.map((log, idx) => {
                    let color = "text-slate-300";
                    if (log.includes("[ERROR]")) color = "text-red-400 font-semibold";
                    else if (log.includes("[RESPONSE]")) color = "text-emerald-400";
                    else if (log.includes("[REQUEST]")) color = "text-sky-300";
                    else if (log.includes("[INFO]")) color = "text-slate-400";

                    return (
                      <div key={idx} className={`${color} whitespace-pre-wrap break-all border-b border-slate-950/20 pb-1 last:border-b-0`}>
                        {log}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
