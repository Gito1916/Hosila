"""
Subscription plan catalog for the Hosila admin app.

This catalog is controlled server-side so billing state and entitlements do not
depend on tenant-editable hotel settings.
"""

from decimal import Decimal
from typing import Any

YEARLY_DISCOUNT_RATE = Decimal("0.0625")
DEFAULT_TRIAL_DAYS = 14
SUPPORTED_PLAN_CODES = ("starter", "pro", "enterprise")
SUPPORTED_BILLING_INTERVALS = ("monthly", "yearly")

_MONTHLY_PRICES: dict[str, Decimal] = {
    "starter": Decimal("20000.00"),
    "pro": Decimal("40000.00"),
    "enterprise": Decimal("80000.00"),
}

_PLAN_LABELS: dict[str, str] = {
    "starter": "Starter",
    "pro": "Pro",
    "enterprise": "Enterprise",
}

_PLAN_DESCRIPTIONS: dict[str, str] = {
    "starter": "For small guesthouses and lean front-desk teams.",
    "pro": "For established hotels that need full operational coverage.",
    "enterprise": "For multi-property groups and advanced operational control.",
}

_PLAN_ENTITLEMENTS: dict[str, dict[str, Any]] = {
    "starter": {
        "rooms_limit": 15,
        "restaurant_pos": False,
        "inventory_tracking": False,
        "multi_property": False,
        "priority_support": False,
        "custom_integrations": False,
        "dedicated_account_manager": False,
        "email_support": True,
        "front_desk": True,
        "report_export": False,
        "guest_email_automation": False,
        "email_parsing": False,
        "website_hooking": False,
    },
    "pro": {
        "rooms_limit": 60,
        "restaurant_pos": True,
        "inventory_tracking": True,
        "multi_property": False,
        "priority_support": True,
        "custom_integrations": False,
        "dedicated_account_manager": False,
        "email_support": True,
        "front_desk": True,
        "report_export": True,
        "guest_email_automation": True,
        "email_parsing": False,
        "website_hooking": False,
    },
    "enterprise": {
        "rooms_limit": None,
        "restaurant_pos": True,
        "inventory_tracking": True,
        "multi_property": True,
        "priority_support": True,
        "custom_integrations": True,
        "dedicated_account_manager": True,
        "email_support": True,
        "front_desk": True,
        "report_export": True,
        "guest_email_automation": True,
        "email_parsing": True,
        "website_hooking": True,
    },
}


def normalize_plan_code(plan_code: str) -> str:
    value = plan_code.strip().lower()
    if value not in SUPPORTED_PLAN_CODES:
        raise ValueError(f"Unsupported plan code: {plan_code}")
    return value


def normalize_billing_interval(billing_interval: str) -> str:
    value = billing_interval.strip().lower()
    if value not in SUPPORTED_BILLING_INTERVALS:
        raise ValueError(f"Unsupported billing interval: {billing_interval}")
    return value


def get_plan_price(plan_code: str, billing_interval: str) -> Decimal:
    code = normalize_plan_code(plan_code)
    interval = normalize_billing_interval(billing_interval)
    monthly = _MONTHLY_PRICES[code]
    if interval == "monthly":
        return monthly
    return (monthly * Decimal("12") * (Decimal("1") - YEARLY_DISCOUNT_RATE)).quantize(
        Decimal("0.01")
    )


def get_plan_entitlements(plan_code: str) -> dict[str, Any]:
    code = normalize_plan_code(plan_code)
    return dict(_PLAN_ENTITLEMENTS[code])


def get_plan_catalog() -> list[dict[str, Any]]:
    return [
        {
            "code": code,
            "name": _PLAN_LABELS[code],
            "description": _PLAN_DESCRIPTIONS[code],
            "monthly_amount": get_plan_price(code, "monthly"),
            "yearly_amount": get_plan_price(code, "yearly"),
            "currency": "NGN",
            "yearly_discount_rate": YEARLY_DISCOUNT_RATE,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "entitlements": get_plan_entitlements(code),
        }
        for code in SUPPORTED_PLAN_CODES
    ]
