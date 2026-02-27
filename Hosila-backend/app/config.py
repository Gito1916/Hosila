"""
Application configuration — loaded from environment variables.
Uses pydantic-settings for validation and type coercion.

In production, fail-fast validation ensures no dev defaults leak through.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Supabase ──────────────────────────────────────────────
    supabase_url: str = "https://localhost"
    supabase_anon_key: str = "dev-anon-key"
    supabase_service_role_key: str = "dev-service-role-key"
    supabase_jwt_secret: str = "dev-jwt-secret"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/postgres"

    # ── Email (Resend) ───────────────────────────────────────
    resend_api_key: str = ""
    hosila_logo_url: str = "https://ywxsopiokkdytgsvyacg.supabase.co/storage/v1/object/public/hotel-assets/Hosila-icon-logo.png"
    email_from_address: str = "notifications@mail.hosila.com"
    email_from_name: str = "Hosila"

    # ── App ───────────────────────────────────────────────────
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000,https://hosila.com"
    api_version: str = "v1"
    debug: bool = False

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated origins into a list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


def _validate_production(s: Settings) -> None:
    """
    Fail-fast validation for production deployments.
    Prevents the app from booting with insecure dev defaults.
    """
    if s.environment != "production":
        return

    errors: list[str] = []

    if s.supabase_jwt_secret in ("dev-jwt-secret", ""):
        errors.append("SUPABASE_JWT_SECRET must be set (not default) in production")

    if s.supabase_service_role_key in ("dev-service-role-key", ""):
        errors.append("SUPABASE_SERVICE_ROLE_KEY must be set (not default) in production")

    if "localhost" in s.database_url:
        errors.append("DATABASE_URL must not point to localhost in production")

    if s.debug:
        errors.append("DEBUG must be False in production")

    if errors:
        raise RuntimeError(
            "Production configuration validation failed:\n  - " + "\n  - ".join(errors)
        )


settings = Settings()
_validate_production(settings)
