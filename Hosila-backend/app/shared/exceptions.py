"""
Custom HTTP exceptions for consistent error responses.
"""

from fastapi import HTTPException


class NotFoundError(HTTPException):
    def __init__(self, entity: str, entity_id: str):
        super().__init__(
            status_code=404,
            detail=f"{entity} with ID '{entity_id}' not found",
        )


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "You do not have permission to perform this action"):
        super().__init__(status_code=403, detail=detail)


class ConflictError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=409, detail=detail)


class ValidationError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=422, detail=detail)


class ServiceUnavailableError(HTTPException):
    def __init__(self, detail: str = "Service temporarily unavailable"):
        super().__init__(status_code=503, detail=detail)
