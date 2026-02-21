"""
Idempotency key handling.
Prevents duplicate financial operations (e.g., double-charge on network retry).
Uses a simple DB-backed approach: store processed idempotency keys with their results.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import json


async def check_idempotency(
    db: AsyncSession,
    hotel_id: str,
    idempotency_key: str,
) -> dict | None:
    """
    Check if an idempotency key has already been processed.
    Returns the cached response if it has, None otherwise.
    """
    result = await db.execute(
        text("""
            SELECT response_data FROM idempotency_keys
            WHERE hotel_id = :hotel_id AND key = :key
        """),
        {"hotel_id": hotel_id, "key": idempotency_key},
    )
    row = result.first()
    if row:
        return json.loads(row.response_data) if row.response_data else {}
    return None


async def store_idempotency(
    db: AsyncSession,
    hotel_id: str,
    idempotency_key: str,
    response_data: dict,
) -> None:
    """Store the response for an idempotency key."""
    await db.execute(
        text("""
            INSERT INTO idempotency_keys (hotel_id, key, response_data)
            VALUES (:hotel_id, :key, :response_data::jsonb)
            ON CONFLICT (hotel_id, key) DO NOTHING
        """),
        {
            "hotel_id": hotel_id,
            "key": idempotency_key,
            "response_data": json.dumps(response_data),
        },
    )
