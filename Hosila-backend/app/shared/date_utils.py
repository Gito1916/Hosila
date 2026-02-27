"""
Date range utilities for consistent timestamp filtering across reports.

Uses exclusive upper bound: [start 00:00:00, end+1day 00:00:00)
This avoids the microsecond gap bug with time(23, 59, 59).
"""

from datetime import date, datetime, time, timedelta


def date_range_to_timestamps(start: date, end: date) -> tuple[datetime, datetime]:
    """
    Convert a date range to timestamp bounds for SQL filtering.

    Returns (start_ts, end_ts) where:
      - start_ts = start date at midnight (inclusive)
      - end_ts   = end date + 1 day at midnight (exclusive)

    Usage in SQL: WHERE col >= :start_ts AND col < :end_ts
    """
    start_ts = datetime.combine(start, time.min)
    end_ts = datetime.combine(end + timedelta(days=1), time.min)
    return start_ts, end_ts
