"""
Period-aware export mode resolution.

Determines the export layout based on the date range:
  - daily_transactions:  start == end (single day → transaction-level detail)
  - daily_summary:       span ≤ 31 days (weekly/monthly → one row per day)
  - monthly_summary:     span > 31 days (yearly → one row per month)
"""

from datetime import date
from fastapi import HTTPException


VALID_MODES = {"auto", "daily_transactions", "daily_summary", "monthly_summary"}


def resolve_export_mode(start: date, end: date, mode: str = "auto") -> str:
    """
    Resolve the export layout mode from date range and optional override.

    Args:
        start: Period start date (inclusive).
        end:   Period end date (inclusive).
        mode:  "auto" for automatic detection, or an explicit mode override.

    Returns:
        One of "daily_transactions", "daily_summary", "monthly_summary".

    Raises:
        HTTPException(422) if start > end or mode is invalid.
    """
    if mode not in VALID_MODES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid mode '{mode}'. Must be one of: {', '.join(sorted(VALID_MODES))}",
        )

    if start > end:
        raise HTTPException(
            status_code=422,
            detail=f"start ({start}) must be on or before end ({end})",
        )

    if mode != "auto":
        return mode

    # Auto-detect
    span = (end - start).days
    if span == 0:
        return "daily_transactions"
    elif span <= 31:
        return "daily_summary"
    else:
        return "monthly_summary"
