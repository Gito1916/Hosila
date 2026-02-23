"""
Tax engine service — the core financial calculation logic.

ALL tax calculations that appear anywhere in Hosila must go through
this module. The frontend NEVER computes taxes.

Rules:
  1. Service charge = base_amount × sc_rate
  2. VAT = base_amount × vat_rate  (calculated on base only, NOT base+sc)
  3. TDL = base_amount × tdl_rate  (calculated on base only, NOT base+sc)
  4. VAT and TDL NEVER compound each other
  5. All amounts use Decimal with ROUND_HALF_UP to 2 decimal places
"""

from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tax_engine.schemas import (
    TaxCalculationRequest,
    TaxCalculationResponse,
    TaxComponent,
    TaxSettingsRead,
    TaxSettingsUpdate,
)


# ── Constants ─────────────────────────────────────────────────

TWO_PLACES = Decimal("0.01")

DEFAULT_VAT_RATE = Decimal("7.5")
DEFAULT_TDL_RATE = Decimal("5.0")
DEFAULT_SC_RATE = Decimal("10.0")


def _round(amount: Decimal) -> Decimal:
    """Round to 2 decimal places using banker's rounding."""
    return amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _coerce_row(row) -> dict:
    """Convert a DB row to a dict, coercing UUID fields to strings."""
    from uuid import UUID
    d = dict(row)
    for key, value in d.items():
        if isinstance(value, UUID):
            d[key] = str(value)
    return d


# ── Settings Retrieval ────────────────────────────────────────

async def get_tax_settings(
    db: AsyncSession,
    hotel_id: str,
    department: str,
) -> dict:
    """
    Fetch tax settings for a hotel + department.
    Falls back to 'all' department settings if no department-specific config exists.
    Falls back to defaults if no settings exist at all.
    """
    # Try exact department match first
    result = await db.execute(
        text("""
            SELECT * FROM tax_settings
            WHERE hotel_id = :hotel_id AND department = :department
            LIMIT 1
        """),
        {"hotel_id": hotel_id, "department": department},
    )
    row = result.mappings().first()

    if not row:
        # Fall back to 'all' department
        result = await db.execute(
            text("""
                SELECT * FROM tax_settings
                WHERE hotel_id = :hotel_id AND department = 'all'
                LIMIT 1
            """),
            {"hotel_id": hotel_id},
        )
        row = result.mappings().first()

    if row:
        return dict(row)

    # Return defaults if nothing configured
    return {
        "vat_rate": DEFAULT_VAT_RATE,
        "tdl_rate": DEFAULT_TDL_RATE,
        "service_charge_rate": DEFAULT_SC_RATE,
        "service_charge_enabled": True,
        "vat_enabled": True,
        "tdl_enabled": False,  # TDL off by default, hotel must opt in
        "vat_calculation_base": "base_only",
        "tdl_calculation_base": "base_only",
    }


async def get_all_tax_settings(
    db: AsyncSession,
    hotel_id: str,
) -> list[TaxSettingsRead]:
    """Fetch all tax settings rows for a hotel."""
    result = await db.execute(
        text("SELECT * FROM tax_settings WHERE hotel_id = :hotel_id ORDER BY department"),
        {"hotel_id": hotel_id},
    )
    rows = result.mappings().all()
    return [TaxSettingsRead(**_coerce_row(row)) for row in rows]


async def upsert_tax_settings(
    db: AsyncSession,
    hotel_id: str,
    department: str,
    data: TaxSettingsUpdate,
) -> TaxSettingsRead:
    """Create or update tax settings for a hotel + department."""
    update_fields = data.model_dump(exclude_none=True)

    if not update_fields:
        # Nothing to update, just return current
        settings = await get_tax_settings(db, hotel_id, department)
        return TaxSettingsRead(hotel_id=hotel_id, department=department, **settings)

    # Build SET clause dynamically
    set_clauses = ", ".join(f"{k} = :{k}" for k in update_fields)
    params = {"hotel_id": hotel_id, "department": department, **update_fields}

    await db.execute(
        text(f"""
            INSERT INTO tax_settings (hotel_id, department, {', '.join(update_fields.keys())})
            VALUES (:hotel_id, :department, {', '.join(f':{k}' for k in update_fields)})
            ON CONFLICT (hotel_id, department)
            DO UPDATE SET {set_clauses}, updated_at = NOW()
        """),
        params,
    )
    await db.commit()

    # Re-fetch
    result = await db.execute(
        text("SELECT * FROM tax_settings WHERE hotel_id = :hotel_id AND department = :department"),
        {"hotel_id": hotel_id, "department": department},
    )
    row = result.mappings().first()
    return TaxSettingsRead(**_coerce_row(row))


# ── Core Calculation ──────────────────────────────────────────

async def calculate_tax_breakdown(
    db: AsyncSession,
    hotel_id: str,
    request: TaxCalculationRequest,
) -> TaxCalculationResponse:
    """
    Calculate full tax breakdown for a given base amount and department.

    This is THE function. Every charge, every checkout, every invoice
    must use this to compute taxes. No exceptions.
    """
    settings = await get_tax_settings(db, hotel_id, request.department)

    base = Decimal(str(request.base_amount))

    # ── Service Charge ────────────────────────────
    sc_enabled = settings.get("service_charge_enabled", True)
    sc_rate = Decimal(str(settings.get("service_charge_rate", DEFAULT_SC_RATE)))
    sc_amount = _round(base * sc_rate / 100) if sc_enabled else Decimal("0")

    # ── VAT (Federal) ─────────────────────────────
    vat_enabled = settings.get("vat_enabled", True)
    vat_rate = Decimal(str(settings.get("vat_rate", DEFAULT_VAT_RATE)))
    vat_base_mode = settings.get("vat_calculation_base", "base_only")

    if vat_enabled:
        if vat_base_mode == "base_plus_sc":
            vat_taxable = base + sc_amount
        else:
            vat_taxable = base
        vat_amount = _round(vat_taxable * vat_rate / 100)
    else:
        vat_amount = Decimal("0")

    # ── TDL (State) ───────────────────────────────
    tdl_enabled = settings.get("tdl_enabled", False)
    tdl_rate = Decimal(str(settings.get("tdl_rate", DEFAULT_TDL_RATE)))
    tdl_base_mode = settings.get("tdl_calculation_base", "base_only")

    if tdl_enabled:
        if tdl_base_mode == "base_plus_sc":
            tdl_taxable = base + sc_amount
        else:
            tdl_taxable = base
        tdl_amount = _round(tdl_taxable * tdl_rate / 100)
    else:
        tdl_amount = Decimal("0")

    # ── Total ─────────────────────────────────────
    total = base + sc_amount + vat_amount + tdl_amount

    # ── Breakdown Note ────────────────────────────
    parts = []
    if sc_enabled:
        parts.append(f"SC {sc_rate}%")
    if vat_enabled:
        base_label = "base+SC" if vat_base_mode == "base_plus_sc" else "base"
        parts.append(f"VAT {vat_rate}% on {base_label}")
    if tdl_enabled:
        base_label = "base+SC" if tdl_base_mode == "base_plus_sc" else "base"
        parts.append(f"TDL {tdl_rate}% on {base_label}")

    note = " | ".join(parts) if parts else "No taxes applied"

    return TaxCalculationResponse(
        base_amount=base,
        service_charge=TaxComponent(rate=sc_rate, amount=sc_amount, enabled=sc_enabled),
        vat=TaxComponent(rate=vat_rate, amount=vat_amount, enabled=vat_enabled),
        tdl=TaxComponent(rate=tdl_rate, amount=tdl_amount, enabled=tdl_enabled),
        total=total,
        breakdown_note=note,
    )


# ── Standalone calculation (no DB) ────────────────────────────

def calculate_tax_standalone(
    base_amount: Decimal,
    sc_rate: Decimal = DEFAULT_SC_RATE,
    vat_rate: Decimal = DEFAULT_VAT_RATE,
    tdl_rate: Decimal = DEFAULT_TDL_RATE,
    sc_enabled: bool = True,
    vat_enabled: bool = True,
    tdl_enabled: bool = False,
) -> dict:
    """
    Pure calculation without DB access. Used in tests and batch processing.
    """
    base = Decimal(str(base_amount))

    sc_amount = _round(base * sc_rate / 100) if sc_enabled else Decimal("0")
    vat_amount = _round(base * vat_rate / 100) if vat_enabled else Decimal("0")
    tdl_amount = _round(base * tdl_rate / 100) if tdl_enabled else Decimal("0")
    total = base + sc_amount + vat_amount + tdl_amount

    return {
        "base_amount": base,
        "service_charge": sc_amount,
        "vat": vat_amount,
        "tdl": tdl_amount,
        "total": total,
    }
