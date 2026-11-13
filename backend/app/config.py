"""Application settings loaded from environment variables."""
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()

# If no JWT secret was supplied, generate a random one at boot (never printed).
if not settings.jwt_secret:
    settings.jwt_secret = secrets.token_hex(32)
    print("WARNING: JWT_SECRET not set; generated a random secret for this run. "
          "Tokens will not survive a restart.")
