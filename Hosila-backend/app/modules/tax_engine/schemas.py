"""
Pydantic schemas for the tax engine module.
Defines request/response models for tax calculation and settings.
"""

from decimal import Decimal
from pydantic import BaseModel, Field


# ── Tax Calculation ───────────────────────────────────────────

class TaxCalculationRequest(BaseModel):
    """Request to calculate tax breakdown for a given amount."""
    base_amount: Decimal = Field(..., ge=0, description="Base amount before any taxes")
    department: str = Field(
        ...,
        description="Department: accommodation | restaurant | other_services",
        pattern=r"^(accommodation|restaurant|other_services)$",
    )


class TaxComponent(BaseModel):
    """A single tax component in the breakdown."""
    rate: Decimal
    amount: Decimal
    enabled: bool = True


class TaxCalculationResponse(BaseModel):
    """Full tax breakdown response."""
    base_amount: Decimal
    service_charge: TaxComponent
    vat: TaxComponent
    tdl: TaxComponent
    total: Decimal
    breakdown_note: str


# ── Tax Settings ──────────────────────────────────────────────

class TaxSettingsRead(BaseModel):
    """Tax settings for a specific department."""
    id: str
    hotel_id: str
    department: str
    vat_rate: Decimal
    tdl_rate: Decimal
    service_charge_rate: Decimal
    service_charge_enabled: bool
    vat_enabled: bool
    tdl_enabled: bool
    vat_calculation_base: str
    tdl_calculation_base: str


class TaxSettingsUpdate(BaseModel):
    """Updatable tax settings."""
    vat_rate: Decimal | None = Field(None, ge=0, le=100)
    tdl_rate: Decimal | None = Field(None, ge=0, le=100)
    service_charge_rate: Decimal | None = Field(None, ge=0, le=100)
    service_charge_enabled: bool | None = None
    vat_enabled: bool | None = None
    tdl_enabled: bool | None = None
    vat_calculation_base: str | None = Field(
        None, pattern=r"^(base_only|base_plus_sc)$"
    )
    tdl_calculation_base: str | None = Field(
        None, pattern=r"^(base_only|base_plus_sc)$"
    )


class TaxSettingsListResponse(BaseModel):
    """List of tax settings for all departments."""
    settings: list[TaxSettingsRead]
