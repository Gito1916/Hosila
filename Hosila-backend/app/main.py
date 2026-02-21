"""
Hosila API — Financial backend for Hosila PMS.

This is the main FastAPI application entry point.
All financial calculations, tax processing, reporting, and analytics
are handled here. The React frontend is a pure display layer for finance.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

# ── Module routers ────────────────────────────────────────────
from app.modules.health.router import router as health_router
from app.modules.tax_engine.router import router as tax_router
from app.modules.billing.router import router as billing_router
from app.modules.reports.router import router as reports_router
from app.modules.analytics.router import router as analytics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown hooks."""
    # Startup: connection pool is created lazily by SQLAlchemy
    print(f"🚀 Hosila API starting in {settings.environment} mode")
    yield
    # Shutdown: dispose engine
    from app.database import engine
    await engine.dispose()
    print("🛑 Hosila API shutting down")


app = FastAPI(
    title="Hosila API",
    description="Financial backend for Hosila PMS — tax engine, billing, reports, analytics",
    version="1.0.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────
app.include_router(health_router)
app.include_router(tax_router, prefix="/api/v1")
app.include_router(billing_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "service": "Hosila API",
        "version": "1.0.0",
        "docs": "/docs" if settings.environment != "production" else "disabled",
    }
