# TODO: Replace with Redis-backed rate limiter when scaling horizontally.
# The current in-memory implementation won't share state across multiple
# server instances. See: https://redis.io/commands/incr (sliding window pattern)
"""
Simple in-memory rate limiter for financial endpoints.
Uses a sliding window counter per hotel_id.
For production at scale, replace with Redis-backed limiter.
"""

import time
from collections import defaultdict
from fastapi import Request, HTTPException


class RateLimiter:
    """In-memory sliding window rate limiter."""

    def __init__(self, requests_per_minute: int = 60):
        self.rpm = requests_per_minute
        self.requests: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        """Raise 429 if rate limit exceeded for the given key."""
        now = time.time()
        window_start = now - 60.0

        # Prune old entries
        self.requests[key] = [t for t in self.requests[key] if t > window_start]

        if len(self.requests[key]) >= self.rpm:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later.",
            )

        self.requests[key].append(now)


# Global instance — used as dependency
_limiter = RateLimiter(requests_per_minute=60)


async def rate_limit_dependency(request: Request) -> None:
    """
    FastAPI dependency — rate limits by hotel_id or IP.
    Apply to sensitive endpoints:
        @router.post("/something", dependencies=[Depends(rate_limit_dependency)])
    """
    # Use hotel_id if available (set by tenant middleware), else fall back to IP
    key = getattr(request.state, "hotel_id", None) or request.client.host
    _limiter.check(key)
