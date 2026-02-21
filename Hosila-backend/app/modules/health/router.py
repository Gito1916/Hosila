"""
Health check endpoint for Render deployment monitoring.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint.
    Verifies the API is running and the database is reachable.
    Used by Render for deployment health monitoring.
    """
    try:
        result = await db.execute(text("SELECT 1"))
        result.first()
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "service": "hosila-api",
        "version": "1.0.0",
    }
