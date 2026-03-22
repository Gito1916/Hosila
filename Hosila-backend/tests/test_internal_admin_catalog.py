from datetime import datetime, timezone
from decimal import Decimal

from app.modules.internal_admin.catalog import (
    YEARLY_DISCOUNT_RATE,
    get_plan_catalog,
    get_plan_price,
)
from app.modules.internal_admin.service import add_billing_period


def test_yearly_discount_rate_is_625_basis_points():
    assert YEARLY_DISCOUNT_RATE == Decimal("0.0625")


def test_plan_prices_match_confirmed_catalog():
    assert get_plan_price("starter", "monthly") == Decimal("20000.00")
    assert get_plan_price("starter", "yearly") == Decimal("225000.00")
    assert get_plan_price("pro", "monthly") == Decimal("40000.00")
    assert get_plan_price("pro", "yearly") == Decimal("450000.00")
    assert get_plan_price("enterprise", "monthly") == Decimal("80000.00")
    assert get_plan_price("enterprise", "yearly") == Decimal("900000.00")


def test_catalog_exposes_all_three_plans():
    catalog = get_plan_catalog()
    assert [item["code"] for item in catalog] == ["starter", "pro", "enterprise"]


def test_monthly_renewal_rolls_over_short_months():
    start = datetime(2026, 1, 31, 9, 0, tzinfo=timezone.utc)
    assert add_billing_period(start, "monthly") == datetime(
        2026, 2, 28, 9, 0, tzinfo=timezone.utc
    )


def test_yearly_renewal_handles_leap_day():
    start = datetime(2028, 2, 29, 9, 0, tzinfo=timezone.utc)
    assert add_billing_period(start, "yearly") == datetime(
        2029, 2, 28, 9, 0, tzinfo=timezone.utc
    )
