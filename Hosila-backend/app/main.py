"""
Hosila API — Financial backend for Hosila PMS.

This is the main FastAPI application entry point.
All financial calculations, tax processing, reporting, and analytics
are handled here. The React frontend is a pure display layer for finance.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


# ── Global exception handler (ensures CORS headers on 500s) ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for unhandled exceptions. Returns a JSON response
    with CORS headers so the browser doesn't mask the real error
    as a CORS failure.
    """
    print(f"❌ Unhandled error on {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    origin = request.headers.get("origin", "")
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )
    # Add CORS headers manually so the browser can read the error
    if origin in settings.cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


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
