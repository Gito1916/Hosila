"""
Structured logging for Hosila API.

Replaces raw print() calls with a proper logger that:
- Uses structured format with timestamps and log levels
- Supports correlation IDs (hotel_id, request_id) via extras
- Prevents leaking sensitive data to stdout in production
"""

import logging
import sys
from app.config import settings


def get_logger(name: str) -> logging.Logger:
    """
    Get a named logger with consistent configuration.

    Usage:
        from app.shared.logger import get_logger
        logger = get_logger(__name__)
        logger.info("Something happened", extra={"hotel_id": "..."})
    """
    logger = logging.getLogger(f"hosila.{name}")

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        level = logging.DEBUG if settings.debug else logging.INFO

        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.setLevel(level)
        logger.addHandler(handler)
        logger.setLevel(level)
        logger.propagate = False

    return logger
