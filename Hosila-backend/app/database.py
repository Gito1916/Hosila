"""
Async database connection using SQLAlchemy + asyncpg.
Provides session factory and dependency injection for FastAPI routes.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.config import settings


def _build_async_url(url: str) -> str:
    """Convert postgresql:// to postgresql+asyncpg:// for async driver."""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(
    _build_async_url(settings.database_url),
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=settings.debug,
    # PgBouncer compatibility (Supabase uses PgBouncer in transaction mode)
    # Disable asyncpg's prepared statement cache to avoid
    # "prepared statement already exists" errors
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
