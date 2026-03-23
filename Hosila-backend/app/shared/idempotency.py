"""
Idempotency key handling.
Prevents duplicate financial operations (e.g., double-charge on network retry).

Uses a reserve-first pattern:
1. Reserve the key atomically (INSERT ... ON CONFLICT)
2. Execute business logic
3. Store the response

This prevents race conditions where concurrent requests both pass the
"check if key exists" step before either stores a result.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.shared.logger import get_logger
import json

logger = get_logger(__name__)


async def check_idempotency(
    db: AsyncSession,
    hotel_id: str,
    idempotency_key: str,
) -> dict | None:
    """
    Check if an idempotency key has already been processed.
    Returns the cached response if it has, None otherwise.

    Handles both string and already-decoded dict JSONB values.
    """
    result = await db.execute(
        text("""
            SELECT response_data FROM idempotency_keys
            WHERE hotel_id = :hotel_id AND key = :key
        """),
        {"hotel_id": hotel_id, "key": idempotency_key},
    )
    row = result.first()
    if row and row.response_data is not None:
        # JSONB columns may be returned as dict (already decoded) or str
        if isinstance(row.response_data, dict):
            return row.response_data
        return json.loads(row.response_data)
    return None


async def reserve_idempotency_key(
    db: AsyncSession,
    hotel_id: str,
    idempotency_key: str,
) -> tuple[str, dict | None]:
    """
    Atomically reserve an idempotency key before executing business logic.

    Returns:
        ("reserved", None) — key is now locked for this request; proceed with business logic.
        ("already_processed", cached_response) — a previous request completed; return the cached response.
        ("in_progress", None) — another request is currently processing this key; caller should return 409.

    The INSERT ... ON CONFLICT DO NOTHING + separate SELECT pattern ensures
    that only one concurrent request can reserve the key.
    """
    # Try to atomically reserve the key
    result = await db.execute(
        text("""
            INSERT INTO idempotency_keys (hotel_id, key, response_data)
            VALUES (:hotel_id, :key, NULL)
            ON CONFLICT (hotel_id, key) DO NOTHING
            RETURNING id
        """),
        {"hotel_id": hotel_id, "key": idempotency_key},
    )
    inserted = result.first()

    if inserted:
        # We successfully reserved the key — proceed with business logic
        await db.commit()
        return ("reserved", None)

    # Key already exists — check if it has a response (completed) or not (in-progress)
    existing = await db.execute(
        text("""
            SELECT response_data FROM idempotency_keys
            WHERE hotel_id = :hotel_id AND key = :key
        """),
        {"hotel_id": hotel_id, "key": idempotency_key},
    )
    row = existing.first()

    if row and row.response_data is not None:
        response_data = row.response_data
        if isinstance(response_data, dict):
            return ("already_processed", response_data)
        return ("already_processed", json.loads(response_data))

    # Key exists but no response yet — another request is in progress
    logger.warning(
        "Idempotency key in progress: hotel=%s key=%s",
        hotel_id, idempotency_key,
    )
    return ("in_progress", None)


async def store_idempotency(
    db: AsyncSession,
    hotel_id: str,
    idempotency_key: str,
    response_data: dict,
) -> None:
    """Store the response for a previously reserved idempotency key."""
    await db.execute(
        text("""
            UPDATE idempotency_keys
            SET response_data = CAST(:response_data AS jsonb)
            WHERE hotel_id = :hotel_id AND key = :key
        """),
        {
            "hotel_id": hotel_id,
            "key": idempotency_key,
            "response_data": json.dumps(response_data),
        },
    )
