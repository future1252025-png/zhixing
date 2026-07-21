import pytest

from app.core.config import Settings, validate_settings


def test_validate_settings_blocks_default_jwt_in_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "dev-only-change-me-before-production")
    monkeypatch.setattr(
        "app.core.config.settings",
        Settings(
            app_env="production",
            jwt_secret_key="dev-only-change-me-before-production",
        ),
    )

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        validate_settings()


def test_validate_settings_allows_custom_jwt_in_production(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.config.settings",
        Settings(
            app_env="production",
            jwt_secret_key="a-strong-secret-for-tests-only",
            cors_allow_origins=("https://example.com",),
        ),
    )

    validate_settings()
