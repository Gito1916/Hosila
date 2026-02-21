"""
Billing API routes.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant
from app.middleware.rate_limit import rate_limit_dependency
from app.modules.billing import service
from app.modules.billing.schemas import CheckoutRequest, InvoiceResponse

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.post(
    "/checkout",
    response_model=InvoiceResponse,
    summary="Generate invoice at checkout",
    description=(
        "Generates a tax-compliant invoice for a booking checkout. "
        "Calculates SC + VAT + TDL per charge, records tax_transactions, "
        "and creates journal entries. Uses idempotency key to prevent duplicates."
    ),
    dependencies=[Depends(rate_limit_dependency)],
)
async def checkout(
    request: CheckoutRequest,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    return await service.generate_invoice(
        db, tenant.hotel_id, tenant.user_id, request
    )
