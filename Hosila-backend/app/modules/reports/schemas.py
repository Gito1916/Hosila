"""
Pydantic schemas for all report types.
"""

from decimal import Decimal
from datetime import date, datetime
from pydantic import BaseModel, Field


# ── Shared ────────────────────────────────────────────────────

class DateRangeParams(BaseModel):
    start: date
    end: date


# ── Accommodation Report ──────────────────────────────────────

class RoomTypeRevenue(BaseModel):
    room_type: str
    total_revenue: Decimal
    nights_sold: int
    average_rate: Decimal


class AccommodationReport(BaseModel):
    period_start: date
    period_end: date
    total_revenue: Decimal
    total_rooms_available: int
    total_room_nights: int
    rooms_sold: int
    occupancy_rate: Decimal = Field(..., description="Rooms sold / available room-nights × 100")
    adr: Decimal = Field(..., description="Average Daily Rate = revenue / rooms sold")
    revpar: Decimal = Field(..., description="RevPAR = revenue / available room-nights")
    revenue_by_room_type: list[RoomTypeRevenue]
    tax_collected: Decimal
    service_charge_collected: Decimal


# ── Restaurant Report ─────────────────────────────────────────

class MenuItemSales(BaseModel):
    item_name: str
    category: str
    quantity_sold: int
    revenue: Decimal
    cost_price: Decimal | None = None
    gross_margin: Decimal | None = None
    margin_percent: Decimal | None = None


class PaymentMethodSplit(BaseModel):
    method: str
    amount: Decimal
    count: int


class DailyRevenue(BaseModel):
    date: date
    revenue: Decimal
    order_count: int


class RestaurantReport(BaseModel):
    period_start: date
    period_end: date
    total_revenue: Decimal
    total_orders: int
    average_order_value: Decimal
    top_sellers: list[MenuItemSales]
    bottom_sellers: list[MenuItemSales]
    all_items: list[MenuItemSales]
    payment_split: list[PaymentMethodSplit]
    daily_breakdown: list[DailyRevenue]
    tax_collected: Decimal
    service_charge_collected: Decimal


# ── Inventory Report ──────────────────────────────────────────

class InventoryItemReport(BaseModel):
    item_id: str
    item_name: str
    category: str
    unit_type: str
    opening_stock: int
    purchases: int
    usage: int
    wastage: int
    closing_stock: int
    unit_cost: Decimal
    total_value: Decimal


class InventoryReport(BaseModel):
    period_start: date
    period_end: date
    items: list[InventoryItemReport]
    total_opening_value: Decimal
    total_closing_value: Decimal
    total_purchases_value: Decimal
    total_usage_value: Decimal


# ── Tax Remittance Report ─────────────────────────────────────

class TaxTypeSummary(BaseModel):
    tax_type: str
    total_amount: Decimal
    remitted_amount: Decimal
    pending_amount: Decimal
    transaction_count: int


class DepartmentTaxBreakdown(BaseModel):
    department: str
    vat: Decimal
    tdl: Decimal
    service_charge: Decimal


class TaxRemittanceReport(BaseModel):
    period_start: date
    period_end: date
    federal_vat: TaxTypeSummary
    state_tdl: TaxTypeSummary
    service_charge: TaxTypeSummary
    by_department: list[DepartmentTaxBreakdown]


class MarkRemittedRequest(BaseModel):
    tax_type: str = Field(..., pattern=r"^(vat|tdl)$")
    period_start: date
    period_end: date
    notes: str | None = None


class RemittanceBatchResponse(BaseModel):
    batch_id: str
    tax_type: str
    total_amount: Decimal
    transactions_marked: int
    status: str


# ── V2 Export Schemas ─────────────────────────────────────────

# Accommodation

class AccommodationDailySummaryRow(BaseModel):
    date: date
    rooms_sold: int
    occupancy_rate: Decimal
    daily_revenue: Decimal


class AccommodationMonthlySummaryRow(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    rooms_sold: int
    occupancy_rate: Decimal
    monthly_revenue: Decimal


class AccommodationTransactionRow(BaseModel):
    time: datetime
    booking_id: str
    guest_name: str
    room_number: str
    description: str
    amount: Decimal
    status: str


# Restaurant

class RestaurantDailySalesRow(BaseModel):
    date: date
    orders: int
    food_revenue: Decimal
    drinks_revenue: Decimal
    total_revenue: Decimal


class RestaurantMonthlySalesRow(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    orders: int
    food_revenue: Decimal
    drinks_revenue: Decimal
    total_revenue: Decimal


class RestaurantTransactionRow(BaseModel):
    time: datetime
    order_number: str
    guest_room: str
    item_name: str
    category: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    status: str
