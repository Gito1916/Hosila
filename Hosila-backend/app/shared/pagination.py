"""
Pagination utilities for list endpoints.
"""

from pydantic import BaseModel


class PaginationParams(BaseModel):
    """Query parameters for paginated endpoints."""
    offset: int = 0
    limit: int = 50

    @property
    def safe_limit(self) -> int:
        """Cap limit at 100 to prevent abuse."""
        return min(self.limit, 100)


class PaginatedResponse(BaseModel):
    """Standard paginated response wrapper."""
    data: list
    total: int
    offset: int
    limit: int
    has_more: bool
