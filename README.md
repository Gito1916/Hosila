# Hosila

Property Management System for Nigerian hospitality: hotel operations,
restaurant POS, financial reporting, tax compliance, and internal SaaS
subscription management.

## Structure

```text
Hosila/
|-- Hosila-frontend/   React + Vite hotel product
|-- Hosila-admin/      React + Vite internal admin app
|-- Hosila-backend/    FastAPI + Supabase/Postgres
|   `-- supabase/      Database migrations
`-- Hosila-landing/    Astro marketing site
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Admin App | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3.14, FastAPI, SQLAlchemy (async) |
| Database | Supabase (PostgreSQL 17) |
| Auth | Supabase Auth (JWKS verification) |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

## Local development

### Hotel frontend

```bash
cd Hosila-frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`

### Admin app

```bash
cd Hosila-admin
npm install
npm run dev
```

Runs on `http://localhost:5174`

### Backend

```bash
cd Hosila-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Runs on `http://localhost:8000`
