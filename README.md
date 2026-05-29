# 📊 Robust Offline-First Expense Tracker App

A premium, secure, and offline-first Expense Tracker built with a **React (Vite) frontend** and a **Flask backend** backed by **PostgreSQL**. The application is designed to be fully functional offline, using IndexedDB (via Dexie) for local storage and synchronizing seamlessly with the server when a network connection is available.

---

## 🚀 Key Features

* **Offline-First Storage & Syncing**: Log, modify, and delete transactions while offline. Dexie caches transactions locally, and a synchronization manager pushes/pulls changes to/from the PostgreSQL database once online, automatically avoiding duplicate logs.
* **httpOnly Cookie-based JWT Auth**: Fully rewritten authentication flow migrating token storage from `localStorage` to **httpOnly cookies**. This completely mitigates XSS (Cross-Site Scripting) token theft risks.
* **Double-Submit CSRF Protection**: Secures mutating state endpoints (POST, PUT, PATCH, DELETE) by validating the request header `X-CSRF-TOKEN` against the cookie token.
* **Splitting Expenses**: Group billing and shared transaction splitting with individual settlement tracking.
* **Recurring Transactions**: Automatically schedule and post transactions on customizable intervals (daily, weekly, monthly, yearly).
* **Built-in Diagnostic Logs Console**: Real-time network and client environment logging shown directly on the login page to quickly troubleshoot local hosting IP variations or backend timeouts.
* **Responsive Dark Theme UI**: A gorgeous, glassmorphism-styled dashboard built with Tailwind CSS.

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 (Vite) | High performance, modular SPA builder |
| **Local Storage** | Dexie.js | Wrapper for robust client-side IndexedDB access |
| **HTTP Client** | Axios | Configured with credentials and interceptors for cookies + CSRF |
| **Backend Framework** | Flask (Python 3.x) | Lightweight API layer |
| **ORM & Database** | SQLAlchemy / PostgreSQL | Relational model storage with schema migrations |
| **Auth Security** | Flask-JWT-Extended | Manages httpOnly cookie creation and validation |
| **Rate Limiter** | Flask-Limiter | Safeguards endpoints against authentication brute-force |
| **Styling** | Tailwind CSS / Vanilla CSS | Premium modern dark aesthetics |

---

## 📂 Project Structure

```
Expense-Tracker-App/
├── backend/                  # Flask REST API & DB migrations
│   ├── app/
│   │   ├── api/              # Route blueprints (auth, sync, recurring, splits)
│   │   ├── models/           # SQLAlchemy DB models
│   │   ├── config.py         # App configuration & JWT cookie scopes
│   │   └── __init__.py       # App factory, CORS Setup, and Request Logging
│   ├── migrations/           # Database alembic schema version records
│   ├── run.py                # Server entry point (starts server on 0.0.0.0:5000)
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/       # Reusable components (SyncManager, TransactionModal, etc.)
│   │   ├── pages/            # View pages (Dashboard, Login)
│   │   ├── services/         # Axios instance, dynamic endpoint detection, and API calls
│   │   └── hooks/            # State hooks (useOnlineStatus, etc.)
│   ├── .env                  # Frontend build configuration variables
│   └── package.json          # Node dependencies and scripts
└── README.md                 # This file
```

---

## ⚙️ Development Setup

### 1. Backend Setup (Flask)

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure database and environment variables in a `.env` file inside the `backend/` folder (or rely on defaults):
   ```env
   FLASK_ENV=development
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/expense_tracker
   SECRET_KEY=dev-secret-key-change-me
   JWT_SECRET_KEY=jwt-secret-key-change-me
   ```
5. Apply database migrations:
   ```bash
   flask db upgrade
   ```
6. Run the server:
   ```bash
   python run.py
   ```
   *The server runs by default on `http://localhost:5000` (and is exposed on your local LAN interfaces `0.0.0.0`).*

### 2. Frontend Setup (React)

1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env` (optional):
   ```env
   # Leave commented out to dynamically resolve to current hostname on LAN (recommended):
   # VITE_API_URL=http://localhost:5000
   ```
4. Start the Vite development server:
   ```bash
   npm run dev --host
   ```
   *Exposes the app on port `5173`. Access it at `http://localhost:5173` or via the printed LAN IP on other local network devices.*

---

## 🔒 Security Architectures

### httpOnly Cookie Authentication
Access tokens are saved directly in an `httpOnly` secure cookie. Because the cookie has the `httpOnly` attribute, it cannot be read or accessed by client-side JavaScript. This completely protects the user's active session token from XSS attacks.

### Cross-Site Request Forgery (CSRF) Mitigation
Since cookies are sent automatically with requests, the application employs **Double-Submit Cookie Verification** to block CSRF exploits:
1. The server sets a standard readable cookie named `csrf_access_token` containing a unique CSRF validation token.
2. The frontend Axios interceptor reads this cookie client-side.
3. For any mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`), Axios copies this token value and attaches it to the custom `X-CSRF-TOKEN` request header.
4. The backend verifies that the header token matches the cookie token before authorizing any write operations.

---

## 📡 Dynamic API Hostname Resolution
When sharing/testing the app on a local LAN network (e.g. accessing `http://10.102.120.201:5173` from a mobile phone or another machine), API requests will fail if hardcoded to `localhost`. 

The Axios instance automatically detects your current context:
```javascript
const BASE_URL = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:5000`;
```
This ensures your frontend dynamically references the correct backend address regardless of whether you access via `localhost`, `127.0.0.1`, a LAN IP, or a domain name, completely configuration-free.
