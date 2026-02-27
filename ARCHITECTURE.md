# Hosila — Architecture Document

> **Master context file for AI coding agents.**
> Feed this document to any LLM before it touches the codebase.

---

## 1. Project Overview

**Hosila** (formerly HotelFlow) is a full-featured **Hotel Property Management System (PMS)** built as a **Progressive Web App (PWA)** with optional **Electron** desktop packaging. It is designed for small-to-medium hotels (5–60 rooms) in Africa, handling:

- Front desk operations (bookings, check-in/out, room management)
- Guest management (profiles, history, loyalty)
- Restaurant / Room Service (POS, cart, charge-to-room)
- Inventory tracking (items, stock movements, low-stock alerts)
- Double-entry accounting (charges, payments, FIFO allocation, journal entries)
- Financial reporting (KPIs, donut charts, area charts, tax summaries, remittance)
- Tax engine (per-department SC/VAT/TDL with configurable calculation bases)
- AI email import (parse OTA emails from Booking.com / Airbnb into reservations)
- Role-based access control (admin, manager, frontdesk, restaurant)
- Settings & multi-tenant hotel configuration (Support for Tax-inclusive pricing and custom TDL names)

**Deployment**: Frontend on **Vercel** (`https://hosila.vercel.app`), Backend API on **Render** (`https://hosila.onrender.com`), Database on **Supabase** (Postgres + Auth + Realtime).

---

## 1.1 App Features

### Dashboard
- **Page**: `Dashboard.tsx` → `DashboardKPIs`, `OccupancyCard`, `RevenueChart`
- Real-time KPIs: today's revenue, occupancy %, check-ins, check-outs
- Revenue area chart (daily/weekly/monthly), occupancy gauge
- Today's activity feed: arrivals, departures, pending tasks
- Backend KPIs via `useDashboardKPIs` hook

### Bookings & Room Management
- **Page**: `Bookings.tsx` → `RoomStatusGrid`, `RoomCard`, `BookingWizard`
- Room grid with color-coded status cards (available, occupied, dirty, maintenance, short rest)
- Floor-based grouping and room type filtering
- Check-in modal with tax breakdown (SC + VAT + TDL), ID photo capture
- Check-out modal with balance summary and payment collection
- Quick actions: mark clean, set maintenance, extend stay

### Reservations
- **Page**: `Reservations.tsx` → `ReservationList`, `ReservationForm`
- Create/edit reservations with date validation and room availability filtering
- Convert reservation → booking on arrival
- AI email import from OTA platforms (Booking.com, Airbnb)

### Guest Management
- **Page**: `Guests.tsx` → `GuestList`, `GuestDetail`, `GuestForm`
- Guest profiles with contact info, ID documents, stay history
- Search and filter by name, phone, email
- Guest ledger link to view full financial history per booking

### Guest Ledger
- **Page**: `GuestLedger.tsx` → `GuestLedgerView`
- Per-booking view of all charges and payments
- Take payment (cash/transfer/POS), generate invoice/receipt
- Charge-to-room from restaurant or other services
- Balance tracking with FIFO payment allocation

### Restaurant POS
- **Page**: `Restaurant.tsx` → `RestaurantMenu`, `RestaurantCart`, `OrderHistory`
- Menu browser with categories, search, and quantity controls
- Desktop sidebar cart + mobile bottom sheet cart
- Checkout: "Pay Now" (cash/transfer/POS) or "Charge to Guest" (room tab)
- Order history with status tracking

### Inventory
- **Page**: `Inventory.tsx` (tabbed: Stock Items / Movement Report)
- **Stock Items tab**: `InventoryList` — CRUD for items, low-stock alerts, stock movements
- **Movement Report tab**: `InventoryReport` — backend-powered analytics (opening stock, purchases, usage, wastage, closing stock) via `useInventoryReport`
- Categories: food, housekeeping, maintenance, front office, beverages, laundry, amenities
- Excel/PDF export via backend
- **IMPORTANT**: All manual stock movements MUST set `source` field (`'restock'` for adds, `'manual_deduct'` for deductions). The movement report filters by source.

### Finance
- **Page**: `Finance.tsx` (tabbed: Overview / Income / Expenses / Transactions / Tax)
- **Overview**: `FinanceDashboard` — KPI cards, revenue/expense charts, donut charts, backend analytics via `useDashboardKPIs`
- **Income**: `IncomeTab` — sub-tabs for Accommodation (with backend analytics: Revenue, Occupancy, ADR, RevPAR, revenue by room type via `useAccommodationReport`), Restaurant (with backend analytics: Revenue, Orders, Avg Order, Top Sellers, Payment Methods via `useRestaurantReport`), and Other Income
- **Expenses**: `ExpenseList` + `ExpenseForm` — expense recording with categories, void support
- **Transactions**: `TransactionsList` — unified ledger of all financial movements
- **Tax**: `TaxSummary` — SC/VAT/TDL breakdown per department, remittance tracking via `useTaxRemittanceReport`, mark-as-remitted
- **Export**: `FinanceExport` modal — downloads accommodation, restaurant, inventory, and tax reports as Excel via backend. Accommodation and restaurant use **V2 period-aware endpoints** that auto-detect layout from date range (daily transactions / daily summary / monthly summary)
- Date options: Today / This Week / This Month / This Year / Custom
- Unified date picker shared across all tabs

### Settings
- **Page**: `Settings.tsx` (tabbed: Hotel / Rooms / Users / Finance / Cloud / Email / Backup)
- Hotel profile (name, address, logo, currency)
- Room type configuration (name, base rate, capacity)
- User/staff management with role assignment
- Tax settings panel: per-department SC/VAT/TDL configuration via backend API
- Cloud sync settings, email automation settings

### Automated Guest Email
- Reservation confirmation, check-in welcome, and checkout summary emails
- Customizable HTML templates with Hosila branding
- Triggered via backend endpoints (`/api/v1/email/send/...`)

### PWA & Offline
- Service worker via `vite-plugin-pwa` + Workbox
- App installable on mobile/desktop
- Sync status indicator in sidebar (connected/offline)
- Electron wrapper for Windows/Mac desktop app

---

## 2. Monorepo Structure

The project is organized as a monorepo with two main packages:

```
c:\Hosila\
├── Hosila-frontend/          # React SPA (Vite + TypeScript)
├── Hosila-backend/           # FastAPI Python backend
├── ARCHITECTURE.md           # This file
├── README.md                 # Monorepo overview
├── .gitignore                # Root gitignore
└── .env                      # Root environment variables (frontend)
```

> **Note**: Legacy root-level folders (`src/`, `electron/`, `supabase/`) have been fully migrated or cleaned up. The canonical code strictly lives in `Hosila-frontend/` and `Hosila-backend/`.

---

## 3. Tech Stack

### Frontend (`Hosila-frontend/`)

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | React | 18.3 | UI rendering |
| Bundler | Vite | 6.x | Build tool, dev server, HMR |
| Router | react-router-dom | 7.x | Hash-based routing (`HashRouter`) |
| State (server) | TanStack React Query | 5.x | Data fetching, caching, optimistic updates |
| State (client) | Zustand | 5.x | Auth, theme, notifications, connection status |
| Forms | react-hook-form | 7.x | Form validation and state |
| Styling | Tailwind CSS | 3.4 | Utility-first CSS (dark-mode first, `.light-mode` class toggle) |
| Charts | Recharts | 2.x | PieChart, AreaChart, custom SVG gauges |
| Icons | lucide-react | latest | Consistent icon set |
| Dates | date-fns | 4.x | Date formatting and manipulation |
| Font | Inter (`@fontsource/inter`) | 5.x | Primary typeface |
| IDs | uuid | 11.x | Client-side UUID generation |
| PWA | vite-plugin-pwa + workbox | 0.21.x | Service worker, offline caching |
| Desktop | electron + builder | 40.x | Windows/Mac native app wrapper built from `package.json` scripts |

### Backend (`Hosila-backend/`)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | **FastAPI** (Python 3.11+) | REST API, automatic OpenAPI docs (v0.115+) |
| ORM / DB | **SQLAlchemy Async + asyncpg** | Async Postgres interaction |
| Auth | **python-jose + cryptography** | JWKS + HS256 JWT verification |
| Deployment | **Render** | Free-tier web service, auto-deploy from GitHub |
| CORS | **FastAPI middleware** | `ALLOWED_ORIGINS` env var |

### Database (Supabase)

| Service | Purpose |
|---------|---------|
| **Postgres** | Primary database (RLS-protected, multi-tenant by `hotel_id`) |
| **Auth** | Email/password auth, JWT sessions, `persistSession: true` |
| **Realtime** | WebSocket subscriptions for live data sync across tabs/devices |
| **Edge Functions** | Server-side logic (email parsing, webhook handlers) |
| **Storage** | File uploads (receipts, logos — planned) |

### Environment Variables

**Frontend** (`.env` or Vercel):
```env
VITE_SUPABASE_URL=https://ywxsopiokkdytgsvyacg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_API_BASE_URL=https://hosila.onrender.com
VITE_GOOGLE_CLIENT_ID=<for Gmail OAuth, email import>
```

**Backend** (`.env` or Render):
```env
SUPABASE_URL=https://ywxsopiokkdytgsvyacg.supabase.co
SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_JWT_SECRET=<jwt_secret>
DATABASE_URL=postgresql://...
ENVIRONMENT=production
ALLOWED_ORIGINS=https://hosila.vercel.app
```

---

## 4. Architecture & Data Flow

### 4.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                        │
│                     Hosila-frontend (React)                     │
│                                                                  │
│  ┌──────────────┐  ┌────────────────────┐  ┌─────────────────┐  │
│  │ Zustand       │  │ TanStack Query     │  │ apiClient.ts    │  │
│  │ Stores        │  │ (Supabase data)    │  │ (Backend API)   │  │
│  │ ·authStore    │  │ ·useQuery          │  │ ·taxApi         │  │
│  │ ·themeStore   │  │ ·useMutation       │  │ ·billingApi     │  │
│  │ ·notification │  │ ·optimistic update │  │ ·reportsApi     │  │
│  │ ·connection   │  └──────┬─────────────┘  │ ·analyticsApi   │  │
│  └──────┬───────┘          │                └────────┬────────┘  │
│         │                  ▼                         │           │
│  ┌──────┴──────────────────────────┐                 │           │
│  │      src/db/*.ts (Data Layer)   │                 │           │
│  │  · Supabase client queries      │                 │           │
│  │  · Business logic + audit logs  │                 │           │
│  └─────────────────┬──────────────┘                  │           │
│                    ▼                                  ▼           │
│  ┌──────────────────────┐              ┌──────────────────────┐  │
│  │  Supabase JS Client  │              │  fetch() to Backend  │  │
│  │  (lib/supabase.ts)   │              │  (Bearer JWT auth)   │  │
│  └────────┬─────────────┘              └──────────┬───────────┘  │
└───────────┼────────────────────────────────────────┼─────────────┘
            ▼                                        ▼
┌──────────────────────┐              ┌──────────────────────────┐
│   SUPABASE (Cloud)   │              │  BACKEND API (Render)    │
│  · Postgres + RLS    │◄────────────▶│  Hosila-backend (FastAPI)│
│  · Auth (JWT)        │              │  · Tax Engine            │
│  · Realtime          │              │  · Billing / Invoicing   │
│  · Edge Functions    │              │  · Reports + Export      │
│  · Storage           │              │  · Analytics / KPIs      │
└──────────────────────┘              └──────────────────────────┘
```

### 4.2 Two Data Paths

The frontend uses **two data paths**:

1. **Direct Supabase** — for CRUD operations on core entities (bookings, rooms, guests, expenses, charges, payments). Uses `src/db/*.ts` → Supabase JS Client → Postgres.

2. **Backend API** — for financial computations that must be authoritative (tax calculation, invoicing, reports, analytics). Uses `src/lib/apiClient.ts` → `fetch()` → FastAPI backend → Supabase.

**Rule**: The frontend **never computes taxes directly**. All tax calculations, invoice generation, and financial KPIs go through the backend API.

### 4.3 State Management Rules

| What | Where | Pattern |
|------|-------|---------|
| Auth (user, session, role) | `stores/authStore.ts` (Zustand) | Persisted to localStorage |
| Theme (dark/light) | `stores/themeStore.ts` (Zustand) | `.light-mode` class on `<body>` |
| Server data (bookings, guests, etc.) | TanStack React Query | `useQuery` + `useMutation` with optimistic updates |
| Backend API data (tax, KPIs) | TanStack React Query via `useHosilaApi.ts` | `useQuery` + `useMutation` wrapping `apiClient.ts` |
| Notifications (toasts) | `stores/notificationStore.ts` | In-memory, auto-dismiss |
| Form state | `react-hook-form` | Per-component, not global |

### 4.4 Accounting System (`db/accounting.ts`)

Double-entry bookkeeping with immutable journal entries:

```
                        createCharge()
                    ┌────────────────────┐
                    │ DR: Guest AR (1020)│
                    │ CR: Revenue (40xx) │
                    │ CR: Tax (2010)     │ (if taxable)
                    └────────┬───────────┘
                             │
                             ▼
               createPaymentWithAllocation()
                    ┌────────────────────┐
                    │ DR: Cash (1010)    │
                    │ CR: Guest AR (1020)│
                    └────────┬───────────┘
                             │
                             ▼
                    allocatePaymentFIFO()
                    (oldest charges first)
```

**Account Codes**: `1010` Cash, `1020` Guest AR, `2010` Tax Payable, `4010` Room Revenue, `4020` Restaurant Revenue, `4030` Other Services Revenue, `4040` Other Income Revenue, `49xx` Refund contra-accounts.

### 4.5 Multi-Tenancy

Every database table has a `hotel_id` or `tenant_id` column. Supabase Row Level Security (RLS) policies ensure users can only access data for their own hotel. The `hotel_id` is resolved at runtime via `getHotelId()` in `lib/api.ts`. Backend supports org-level multi-tenancy models as well via `tenant` context middleware.

---

## 5. Backend API Modules (`Hosila-backend/`)

### 5.1 Directory Structure

```
Hosila-backend/
├── app/
│   ├── main.py                # FastAPI app entry, CORS, router mounts
│   ├── middleware/
│   │   ├── auth.py            # JWKS + HS256 JWT verification
│   │   ├── tenant.py          # Tenant resolution (org_id, hotel_id)
│   │   └── rate_limit.py      # Rate limiting interceptors
│   ├── modules/               # Core routing endpoints
│   │   ├── health/            # Liveness and readiness
│   │   ├── tax_engine/        # /api/v1/tax/* (calculation, settings)
│   │   ├── billing/           # /api/v1/billing/checkout
│   │   ├── reports/           # /api/v1/reports/* (accomm, restaurant, inventory, export)
│   │   │   ├── router.py      # All report endpoints (including V2 export)
│   │   │   ├── accommodation.py # Accommodation report + V2 daily/monthly/transaction functions
│   │   │   ├── restaurant.py  # Restaurant report + V2 daily/monthly/transaction functions
│   │   │   ├── inventory.py   # Inventory movement report (opening/closing stock)
│   │   │   ├── export.py      # Excel/PDF builders (legacy + V2)
│   │   │   ├── report_period.py # Period auto-detection (resolve_export_mode)
│   │   │   ├── schemas.py     # Pydantic models for all reports
│   │   │   └── tax_remittance.py
│   │   ├── analytics/         # /api/v1/analytics/dashboard
│   │   ├── email/             # /api/v1/email/* (settings, send, logs)
│   │   └── organisations/     # Org management (Not mounted in main.py yet)
│   ├── config.py              # Environment configuration & Pydantic settings
│   └── database.py            # SQLAlchemy Async setup
├── requirements.txt
├── render.yaml                # Render deployment config
└── tests/
```

### 5.2 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/tax/calculate` | Calculate tax breakdown for amount + department |
| `GET` | `/api/v1/tax/settings` | Get all per-department tax settings |
| `PUT` | `/api/v1/tax/settings/{department}` | Update tax settings for a department |
| `POST` | `/api/v1/billing/checkout` | Generate invoice at checkout (idempotent) |
| `GET` | `/api/v1/reports/accommodation` | RevPAR, ADR, occupancy report |
| `GET` | `/api/v1/reports/restaurant` | Item sales, margins, top sellers |
| `GET` | `/api/v1/reports/inventory` | Stock movement report |
| `GET` | `/api/v1/reports/tax-remittance` | Tax remittance summary |
| `POST` | `/api/v1/reports/tax-remittance/mark-remitted` | Mark tax type as remitted for period |
| `GET` | `/api/v1/reports/{type}/export` | Download report as PDF or Excel (legacy) |
| `GET` | `/api/v1/reports/accommodation/export-v2` | **V2** period-aware accommodation export (auto/daily_transactions/daily_summary/monthly_summary) |
| `GET` | `/api/v1/reports/restaurant/export-v2` | **V2** period-aware restaurant export (auto/daily_transactions/daily_summary/monthly_summary) |
| `GET` | `/api/v1/analytics/dashboard` | Aggregated financial KPIs |
| `GET` | `/api/v1/email/settings` | Get hotel email settings |
| `PUT` | `/api/v1/email/settings` | Update hotel email settings |
| `GET` | `/api/v1/email/logs` | Paginated email send logs |
| `POST` | `/api/v1/email/send/{type}/{id}` | Trigger email (reservation/checkin/checkout) |

### 5.3 Tax Engine

The backend tax engine supports **three tax components** per department:

| Tax | Default Rate | Configurable |
|-----|-------------|--------------|
| **Service Charge (SC)** | 10% | Rate, enable/disable |
| **VAT** | 7.5% | Rate, enable/disable, calculation base |
| **TDL (Tourism Dev. Levy)** | 5% | Rate, enable/disable, calculation base |

**Calculation bases**: `base_only` (tax on base amount only) or `base_plus_sc` (tax on base + service charge).
Settings are stored per department (`accommodation`, `restaurant`, `other_services`) or globally through `HotelSettings.tdl_name` and `tax_inclusive_pricing`.

---

## 6. Frontend Directory Structure

```
Hosila-frontend/
├── src/
│   ├── App.tsx                  # Root: providers, router, lazy route switching
│   ├── main.tsx                 # Entry: renders <App />
│   ├── index.css                # Global styles, theme overrides, .light-mode
│   │
│   ├── pages/                   # Route-level components
│   │   ├── Dashboard.tsx        # KPIs, occupancy, today's activity
│   │   ├── Bookings.tsx         # Room grid + booking management
│   │   ├── Guests.tsx           # Guest list + profiles
│   │   ├── GuestLedger.tsx      # Per-booking charges & payments
│   │   ├── Restaurant.tsx       # POS menu, cart, orders
│   │   ├── Inventory.tsx        # Stock management
│   │   ├── Finance.tsx          # Tabs: Overview, Income, Expenses, Transactions, Tax
│   │   ├── Settings.tsx         # Tabs: Hotel, Rooms, Users, Finance (Tax), Backup, etc.
│   │   ├── Login.tsx            # Auth page
│   │   └── Onboarding.tsx       # First-run hotel setup wizard
│   │
│   ├── components/              # Feature-grouped UI components
│   │   ├── layout/              # MainLayout, Sidebar, Header, MobileNav, Session/Update Prompt
│   │   ├── dashboard/           # DashboardKPIs, OccupancyCard, RevenueChart
│   │   ├── booking/             # BookingWizard, CheckInForm
│   │   ├── bookings/            # BookingsGrid, RoomCard
│   │   ├── rooms/               # RoomGrid, RoomCard, RoomDetail
│   │   ├── guests/              # GuestList, GuestDetail, GuestForm
│   │   ├── reservations/        # ReservationList, ReservationForm
│   │   ├── restaurant/          # RestaurantMenu, RestaurantCart, OrderHistory
│   │   ├── inventory/           # InventoryList, StockMovement
│   │   ├── finance/             # FinanceDashboard, ExpenseList, ExpenseForm, TaxSummary, etc
│   │   ├── billing/             # InvoiceView, ReceiptView
│   │   ├── settings/            # TaxSettingsPanel, Hotel, Rooms, Users, CloudSettings, etc.
│   │   ├── onboarding/          # OnboardingWizard, steps
│   │   └── notifications/       # NotificationToast
│   │
│   ├── db/                      # Supabase DB integration + accounting logic
│   │   ├── accounting.ts        # Charges, payments, FIFO, journal entries
│   │   ├── billing.ts           # Invoice/receipt generation
│   │   ├── bookings.ts          # Booking CRUD, check-in/out, extensions
│   │   ├── dashboard.ts         # Dashboard KPI queries
│   │   ├── finance.ts           # Expenses, revenue queries
│   │   ├── guests.ts            # Guest CRUD, search
│   │   ├── inventory.ts         # Stock items, movements
│   │   ├── reservations.ts      # Reservation CRUD
│   │   ├── rooms.ts             # Room CRUD, status updates
│   │   ├── services.ts          # Restaurant menu, orders
│   │   ├── settings.ts          # Hotel config, user management
│   │   └── transactions.ts      # Unified transaction ledger
│   │
│   ├── hooks/                   # Custom React hooks (Data fetching logic via React Query)
│   ├── stores/                  # Zustand global state (Auth, Theme, Connection, Notifications)
│   ├── lib/                     # API client, error handlers, queryClient, supabase client
│   ├── types/                   # Unified frontend typing definition file (interfaces)
│   ├── utils/                   # Shared pure utility functions
│   └── services/                # External integrations (e.g., email parsing if implemented)
│
├── vercel.json                  # Vercel SPA routing config
├── tailwind.config.js           # Tailwind theme (brand colors, status colors)
├── vite.config.ts               # Vite & PWA setup, explicit module chunk splitting
└── package.json                 # Core scripts (dev, build, electron wrappers)
```

---

## 7. Routing

All routes use `HashRouter` (for Electron compatibility) and components are **lazy-loaded** via `React.lazy()` with a `<Suspense>` fallback:

| Route | Page Component | Auth | Note |
|-------|------|------|------|
| `/login` | `LoginPage` | Public | |
| `/onboarding` | `OnboardingPage` | Public | |
| `/` | `DashboardPage` | Protected | |
| `/bookings` | `BookingsPage` | Protected | Legacy `/rooms` & `/reservations` route here |
| `/guests` | `GuestsPage` | Protected | |
| `/bookings/:bookingId/ledger` | `GuestLedgerPage` | Protected | |
| `/restaurant` | `RestaurantPage` | Protected | |
| `/inventory` | `InventoryPage` | Protected | |
| `/finance` | `FinancePage` | Protected | Tabbed interface |
| `/settings` | `SettingsPage` | Protected | Tabbed interface |

**Protected routes** check `isAuthenticated` → `hotel exists` → `onboarding_complete`.

---

## 8. Finance Page Architecture

The Finance page (`Finance.tsx`) uses a **unified date picker** shared across all tabs (Daily, Weekly, Monthly, Yearly, Custom).

### Tabs

| Tab | Component | Data Source |
|-----|-----------|-------------|
| **Overview** | `FinanceDashboard` | Supabase (local queries) + Backend KPIs (`useDashboardKPIs`) |
| **Income** | `IncomeTab` | Supabase (charges) + Backend API: `useAccommodationReport` (RevPAR, ADR, occupancy, revenue by room type) + `useRestaurantReport` (top sellers, margins, payment split) |
| **Expenses** | `ExpenseList` | Supabase (expenses table) |
| **Transactions** | `TransactionsList` | Supabase (transactions table) |
| **Tax** | `TaxSummary` | Supabase (charges) + Backend API (`useTaxRemittanceReport`, `useMarkRemitted`) |

### Export Modal
`FinanceExport` component uses `useReportDownload` hook. **Accommodation and restaurant** are routed through **V2 endpoints** (`/export-v2?mode=auto`) which auto-detect the export layout from the date range. Inventory and tax-remittance continue using the legacy export endpoint.

### Tax Settings (Settings → Finance tab)
- Per-department cards (Accommodation, Restaurant, Other Services)
- SC / VAT / TDL calculation base customization
- Syncs directly using `PUT /api/v1/tax/settings/{department}` on the backend, alongside core UI configuration.

---

## 9. Theming & Styling

### Theme Architecture
The app uses a **CSS custom property (var) based token system** defined in `src/index.css`, consumed via Tailwind config (`tailwind.config.js`). Theme switching is handled by toggling a `.dark-mode` class on `<body>` via `themeStore` (Zustand).

- **Default**: Light mode (`:root` vars)
- **Dark mode**: `.dark-mode` class overrides the same variables
- **Brand color**: `#21C29C` (teal-green)

### UI Color Token System

#### Brand Scale (static, not theme-switched)

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-50` | `#F4FDFC` | Lightest tint, highlights |
| `brand-100` | `#E8FAF6` | Hover backgrounds |
| `brand-200` | `#D1F3EC` | Active backgrounds |
| `brand-300` | `#9DDDD0` | Disabled states |
| `brand-400` | `#4ADEB6` | Accent elements |
| `brand-500` | `#21C29C` | **Primary brand color** |
| `brand-600` | `#1BAA88` | Hover state |
| `brand-700` | `#168E72` | Active/pressed state |
| `brand-800` | `#0F766E` | Dark accent |
| `brand-900` | `#0C2622` | Near-black tint |
| `brand-950` | `#071A17` | Deepest tint |

#### Semantic Surface Tokens (CSS var → Tailwind class)

| Tailwind Class | CSS Variable | Light | Dark | Usage |
|----------------|-------------|-------|------|-------|
| `bg-surface-base` | `--surface-base` | `#ffffff` | `#121212` | Page background |
| `bg-surface-card` | `--surface-card` | `#fcfffe` | `#1E1E1E` | Card backgrounds |
| `bg-surface-raised` | `--surface-raised` | `#F0FDF9` | `#11332D` | Elevated elements, hovers |
| `bg-surface-inset` | `--surface-inset` | `#E8FAF6` | `#08221D` | Recessed/inset areas |
| `bg-surface-sidebar` | `--surface-sidebar` | `#ffffff` | `#121212` | Sidebar background |
| `bg-surface-sidebar-hover` | `--surface-sidebar-hover` | `#E8FAF6` | `#0B2A24` | Sidebar item hover |
| `bg-surface-sidebar-active` | `--surface-sidebar-active` | `#D1F3EC` | `#113F37` | Active sidebar item |

#### Semantic Text Tokens

| Tailwind Class | CSS Variable | Light | Dark | Usage |
|----------------|-------------|-------|------|-------|
| `text-heading` | `--text-heading` | `#1E1E1E` | `#E0E0E0` | Headings, titles, strong text |
| `text-body` | `--text-body` | `#334155` | `#CDEDE7` | Body/paragraph text |
| `text-muted` | `--text-muted` | `#6B7280` | `#7DD3C6` | Secondary, helper text |
| `text-accent` | `--text-accent` | `#168E72` | `#4ADEB6` | Links, accented text |
| `text-sidebar-text` | `--text-sidebar` | `#1E1E1E` | `#A7F3E6` | Sidebar item labels |
| `text-sidebar-active` | `--text-sidebar-active` | `#0F766E` | `#FFFFFF` | Active sidebar item |

#### Semantic Border Tokens

| Tailwind Class | CSS Variable | Light | Dark | Usage |
|----------------|-------------|-------|------|-------|
| `border-border` | `--border-default` | `#E2E8F0` | `#333333` | Default borders |
| `border-border-strong` | `--border-strong` | `#CBD5E1` | `#333333` | Emphasized borders |
| `border-border-subtle` | `--border-subtle` | `#F1F5F9` | `#333333` | Subtle/low-contrast borders |
| `border-border-sidebar` | `--border-sidebar` | `#D1F3EC` | `#333333` | Sidebar borders |

#### Primary CTA Tokens

| Tailwind Class | CSS Variable | Light | Dark | Usage |
|----------------|-------------|-------|------|-------|
| `bg-primary` | `--primary` | `#21C29C` | `#21C29C` | Primary buttons default |
| hover | `--primary-hover` | `#1BAA88` | `#2DD4BF` | Primary button hover |
| active | `--primary-active` | `#168E72` | `#14B8A6` | Primary button pressed |
| disabled | `--primary-disabled` | `#9DDDD0` | `#0F766E` | Primary button disabled |
| focus | `--focus-ring` | `rgba(33,194,156,0.35)` | `rgba(45,212,191,0.45)` | Focus ring |

Primary also has static shades: `primary-50` through `primary-700` (mirrors brand scale).

#### Room Status Colors (static)

| Tailwind Class | Hex | Status |
|----------------|-----|--------|
| `bg-status-available` | `#10B981` | Room available (green) |
| `bg-status-occupied` | `#E5484D` | Room occupied (red) |
| `bg-status-shortRest` | `#3B82F6` | Short rest / hourly (blue) |
| `bg-status-dirty` | `#F59E0B` | Needs cleaning (amber) |
| `bg-status-maintenance` | `#64748B` | Under maintenance (slate) |

#### Feedback / Alert Colors (static)

| Tailwind Class | Hex | Usage |
|----------------|-----|-------|
| `text-ok` / `bg-ok` | `#10B981` | Success states |
| `text-warn` / `bg-warn` | `#F59E0B` | Warnings |
| `text-danger` / `bg-danger` | `#E5484D` | Errors, destructive |
| `text-info` / `bg-info` | `#3B82F6` | Informational |

### CSS Component Classes (defined in `index.css`)
- `.card`, `.card-header`, `.card-body` — standard card containers
- `.btn`, `.btn-primary`, `.btn-secondary` — button variants
- `.input`, `.label`, `.input-error` — form elements
- `.badge`, `.badge-*` — status badges
- `.finance-card` — finance dashboard specific styling

### Typography
- **Font**: Inter (`@fontsource/inter`)
- **Font stack**: `Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`

---

## 10. Key Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `hotels` | Hotel config & settings | `id`, `name`, `settings` (JSONB) |
| `users` | Staff accounts | `id`, `hotel_id`, `role`, `email`, `password_hash` |
| `rooms` | Room inventory | `id`, `hotel_id`, `room_number`, `room_type`, `status`, `floor_number` |
| `room_types` | Room type config | `id`, `hotel_id`, `name`, `base_rate` |
| `bookings` | Guest stays | `id`, `hotel_id`, `guest_id`, `room_id`, `status`, `rate`, `balance` |
| `guests` | Guest profiles | `id`, `hotel_id`, `name`, `phone`, `email` |
| `payments` | Payment records | `id`, `hotel_id`, `booking_id`, `amount`, `payment_method`, `payment_time` |
| `charges` | Accounting charges | `id`, `hotel_id`, `gross_amount`, `net_revenue`, `tax_amount`, `tax_rate`, `status` |
| `journal_entries` | Immutable double-entry | `id`, `hotel_id`, `account_code`, `entry_type`, `amount` |
| `payment_allocations` | FIFO charge↔payment links | `payment_id`, `charge_id`, `allocated_amount` |
| `expenses` | Operating expenses | `id`, `hotel_id`, `category`, `amount`, `status`, `payment_method` |
| `other_income` | Non-room revenue | `id`, `hotel_id`, `category`, `amount`, `payment_method` |
| `transactions` | Unified ledger view | `id`, `hotel_id`, `type`, `source`, `amount`, `payment_method` |
| `audit_logs` | All state changes | `id`, `hotel_id`, `user_id`, `action`, `entity_type`, `details` |
| `service_orders` | Restaurant orders | `id`, `hotel_id`, `booking_id`, `total_price`, `status` |
| `inventory_items` | Stock items | `id`, `hotel_id`, `name`, `current_stock`, `unit_cost` |
| `inventory_movements` | Stock movements | `id`, `hotel_id`, `item_id`, `movement_type`, `quantity`, `source`, `balance_after` |
| `reservations` | Future bookings | `id`, `hotel_id`, `guest_id`, `room_id`, `check_in_date`, `check_out_date` |
| `receipts` | Payment receipts | `id`, `hotel_id`, `booking_id`, `receipt_number`, `payment_id` |
| `invoices` | Billing invoices | `id`, `hotel_id`, `booking_id`, `invoice_number` |

*(Note: `tax_settings`, `organisations`, `org_members` are backend-managed configuration tables not mirrored on the frontend React entities unless wrapped.)*

---

## 11. AI Developer Guidelines

### MUST Follow

1. **Never hardcode `hotel_id`**. Always call `getHotelId()` from `lib/api.ts`. Multi-tenancy is enforced via RLS.
2. **Use the data layer (`src/db/*.ts`)** for Supabase data. Never call `supabase.from().select()` directly in components.
3. **Use `apiClient.ts` for backend API calls**. Never call `fetch()` to the backend directly in components. Use the hooks in `useHosilaApi.ts`.
4. **Never compute taxes in the frontend**. All tax calculations go through `POST /api/v1/tax/calculate` on the backend.
5. **Maintain dark-mode-first styling**. Use standard Tailwind classes. Light mode is handled by CSS overrides. **Never** use inline color styles for themeable elements.
6. **All DB mutations must go through audit-logged functions**. `createExpense`, `updateExpense`, `voidExpense`, `createCharge`, `createPaymentWithAllocation` — these all log to `audit_logs`.
7. **Use TanStack Query for all server data**. Return type-safe data from `db/` functions, wrap in hooks in `hooks/useSupabaseData.ts` (Supabase) or `hooks/useHosilaApi.ts` (backend API).
8. **Invalidate queries after mutations**. After any mutation, call `queryClient.invalidateQueries()` with the appropriate keys. Realtime sync also handles this for Supabase tables.
9. **Type everything**. All interfaces live in `src/types/index.ts` (Supabase entities). Use strict TypeScript — `npx tsc --noEmit` must pass with zero errors.
10. **Keep the accounting system balanced**. Every debit must have a corresponding credit. Use `createCharge` + `createPaymentWithAllocation` for revenue flows.
11. **Immediately settle non-booking charges**. If recording revenue that is paid on the spot (like Other Income), always call `createPaymentWithAllocation` after `createCharge`.
12. **Use `uuid` for all client-generated IDs**. Import from `uuid` package: `import { v4 as uuidv4 } from 'uuid'`.
13. **Always set `source` on inventory movements**. `'restock'` for adds, `'manual_deduct'` for manual deductions, `'check_in'` for amenity issues, `'loss'` for lost items. The movement report filters on this field.
14. **Use V2 export endpoints** for accommodation and restaurant downloads. The `useReportDownload` hook handles this automatically.

### MUST NOT Do

- ❌ Use `any` type (use proper interfaces from `types/index.ts` or `apiClient.ts`)
- ❌ Write CSS-in-JS or inline styles for theming (use Tailwind + index.css overrides)
- ❌ Access `localStorage` directly for auth (use `authStore`)
- ❌ Create new Zustand stores without approval (most state belongs in React Query)
- ❌ Hard-delete financial records (use `voidExpense` / `createReversal` instead)
- ❌ Use `BrowserRouter` (app uses `HashRouter` for Electron compatibility)
- ❌ Import `supabase` directly in components (use `requireSupabase()` from `lib/api.ts`)
- ❌ Skip the `payment_method` field on financial transactions
- ❌ Compute taxes in the frontend (use backend API)

### Common Commands

**Frontend:**
```bash
cd Hosila-frontend
npm run dev          # Start Vite dev server (localhost:5173)
npm run build        # TypeScript check + Vite production build
npx tsc --noEmit     # Type check only (MUST pass with zero errors)
```

**Backend:**
```bash
cd Hosila-backend
pip install -r requirements.txt
uvicorn app.main:app --reload    # Start FastAPI dev server (localhost:8000)
```

---

## 12. Deployment

| Component | Platform | URL | Trigger |
|-----------|----------|-----|---------|
| Frontend | **Vercel** | `https://hosila.vercel.app` | Push to `master` (root dir: `Hosila-frontend/`) |
| Backend | **Render** | `https://hosila.onrender.com` | Push to `master` (root dir: `Hosila-backend/`) |
| Database | **Supabase** | `ywxsopiokkdytgsvyacg` | Migrations via CLI or MCP |

---

## 13. Supabase Project

| Key | Value |
|-----|-------|
| Project ID | `ywxsopiokkdytgsvyacg` |
| Region | `eu-west-1` |
| DB Host | `db.ywxsopiokkdytgsvyacg.supabase.co` |

### Edge Functions
Located in `supabase/functions/` (if utilized separately). Deployed via Supabase CLI or MCP.

### Migrations
Located in `supabase/migrations/` (if utilized separately). Applied via `supabase db push` or the Supabase MCP `apply_migration` tool.

---

## 14. Upcoming Architecture Changes (Planned)

> These items are earmarked for future development. AI agents should be aware but NOT implement unless explicitly instructed.

- **Subscription Tier Pricing**: Architecture for free/pro/enterprise tiers with feature gating
- **Offline Backup System**: Local data persistence so business operations continue without internet
- **UI/Branding Overhaul**: Major visual redesign and rebrand
