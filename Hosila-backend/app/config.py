"""
Application configuration — loaded from environment variables.
Uses pydantic-settings for validation and type coercion.
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
    debug: bool = True

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated origins into a list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
