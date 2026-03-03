# Hosila

Property Management System for Nigerian hospitality — hotel operations, restaurant POS, financial reporting, and tax compliance.

## Structure

```
Hosila/
├── Hosila-frontend/   → React + Vite (deployed on Vercel)
├── Hosila-backend/    → FastAPI (deployed on Render)
│   └── supabase/      → Database migrations
├── Hosila-landing/    → Astro marketing website (hosila.com)
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Backend | Python 3.14, FastAPI, SQLAlchemy (async) |
| Database | Supabase (PostgreSQL 17) |
| Auth | Supabase Auth (JWKS verification) |
| Frontend Hosting | Vercel |
| Backend Hosting | Render (free tier) |

## Local Development

### Frontend
```bash
cd Hosila-frontend
npm install
npm run dev          # → http://localhost:5173
```

### Backend
```bash
cd Hosila-backend
pip install -r requirements.txt
cp .env.example .env  # Fill in your Supabase credentials
uvicorn app.main:app --reload --port 8000  # → http://localhost:8000/docs
```
