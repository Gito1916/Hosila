"""
Audit logging — writes to the existing audit_logs table.
Every financial action should produce an audit entry.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import json


async def write_audit_log(
    db: AsyncSession,
    hotel_id: str,
    user_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict | None = None,
) -> None:
    """
    Insert an audit log entry.

    Args:
        db: Database session
        hotel_id: Tenant hotel ID
        user_id: User performing the action
        action: What happened (e.g., "invoice_created", "tax_remitted")
        entity_type: Type of entity (e.g., "invoice", "charge", "remittance_batch")
        entity_id: ID of the entity
        details: Optional JSON details
    """
    await db.execute(
        text("""
            INSERT INTO audit_logs (hotel_id, user_id, action, entity_type, entity_id, details)
            VALUES (:hotel_id, :user_id, :action, :entity_type, :entity_id, CAST(:details AS jsonb))
        """),
        {
            "hotel_id": hotel_id,
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": json.dumps(details or {}),
        },
    )
