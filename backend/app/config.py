"""Application settings loaded from environment variables."""
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "production" in the cloud (Cloud Run): stricter startup checks, API docs under /api/docs.
    env: str = "development"

    mongodb_uri: str = "mongodb://mongo:27017"
    db_name: str = "rewind"

    jwt_secret: str = ""
    jwt_expire_minutes: int = 60
    jwt_algorithm: str = "HS256"

    allowed_origins: str = "http://localhost:3000"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # login rate limiting
    login_max_attempts: int = 5
    login_window_minutes: int = 15
    # Also per e-mail across ALL client IPs: behind a load balancer the client IP comes from
    # X-Forwarded-For, which a client can forge, so the per-(email, IP) limit alone is bypassable.
    login_max_attempts_per_email: int = 20

    @property
    def is_production(self) -> bool:
        return self.env.strip().lower() == "production"

    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()

# Production (several instances behind a load balancer): every instance MUST sign with the same
# secret, otherwise a token issued by one instance is rejected by the other. So no fallback: fail.
if not settings.jwt_secret and settings.is_production:
    raise SystemExit("FATAL: JWT_SECRET is required when ENV=production "
                     "(all instances must share it; set it from Secret Manager). Refusing to start.")

# Local development / docker compose: if no JWT secret was supplied, generate a random one at boot
# (never printed).
if not settings.jwt_secret:
    settings.jwt_secret = secrets.token_hex(32)
    print("WARNING: JWT_SECRET not set; generated a random secret for this run. "
          "Tokens will not survive a restart.")
