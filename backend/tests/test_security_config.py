import logging

import pytest

from app.core.config import DEFAULT_JWT_SECRET, Settings, validate_settings


def test_missing_jwt_secret_falls_back_to_stable_process_random_secret() -> None:
    first = Settings(environ={})
    second = Settings(environ={})

    assert first.jwt_secret_key != DEFAULT_JWT_SECRET
    assert len(first.jwt_secret_key.encode("utf-8")) >= 32
    assert first.jwt_secret_key_explicit is False
    # Cached per process so already-issued dev tokens stay verifiable.
    assert first.jwt_secret_key == second.jwt_secret_key


def test_dev_fallback_secret_warns_once_per_process(monkeypatch, caplog) -> None:
    import app.core.config as config_module

    monkeypatch.setattr(config_module, "_generated_dev_jwt_secret", None)
    with caplog.at_level(logging.WARNING, logger="app.core.config"):
        first = Settings(environ={})
        second = Settings(environ={})

    warnings = [
        record for record in caplog.records if "临时随机密钥" in record.getMessage()
    ]
    assert len(warnings) == 1
    assert first.jwt_secret_key == second.jwt_secret_key
    assert first.jwt_secret_key != DEFAULT_JWT_SECRET


def test_validate_settings_rejects_implicit_fallback_secret_in_production() -> None:
    config = Settings(
        environ={
            "APP_ENV": "production",
            "CORS_ALLOW_ORIGINS": "https://campus.example.edu",
        }
    )

    assert config.jwt_secret_key_explicit is False
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        validate_settings(config)


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
            jwt_secret_key="a-strong-secret-for-tests-only-32+",
            cors_allow_origins=("https://example.com",),
        ),
    )

    validate_settings()


@pytest.mark.parametrize(
    "secret",
    [
        "",
        "   ",
        "short-secret",
        "a" * 31,
        DEFAULT_JWT_SECRET,
        f"  {DEFAULT_JWT_SECRET}  ",
    ],
)
def test_validate_settings_rejects_unsafe_production_secret(secret: str) -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key=secret,
        cors_allow_origins=("https://campus.example.edu",),
    )

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        validate_settings(config)


def test_production_secret_minimum_is_measured_in_trimmed_utf8_bytes() -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key=f"  {'密' * 11}  ",
        cors_allow_origins=("https://campus.example.edu",),
    )

    validate_settings(config)


@pytest.mark.parametrize("minutes", [0, -1, 1441])
@pytest.mark.parametrize("app_env", ["development", "production"])
def test_validate_settings_rejects_unsafe_token_ttl_in_all_environments(
    app_env: str,
    minutes: int,
) -> None:
    config = Settings(
        app_env=app_env,
        jwt_secret_key="x" * 32,
        access_token_expire_minutes=minutes,
        cors_allow_origins=("https://campus.example.edu",),
    )

    with pytest.raises(RuntimeError, match="ACCESS_TOKEN_EXPIRE_MINUTES"):
        validate_settings(config)


@pytest.mark.parametrize(
    "origins",
    [
        (),
        ("http://localhost:5173",),
        ("http://127.0.0.1:5173", "http://localhost:5179"),
    ],
)
def test_validate_settings_rejects_missing_or_local_only_production_cors(
    origins: tuple[str, ...],
) -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
        cors_allow_origins=origins,
    )

    with pytest.raises(RuntimeError, match="CORS_ALLOW_ORIGINS"):
        validate_settings(config)


@pytest.mark.parametrize(
    "origin",
    [
        "https://LOCALHOST.",
        "https://app.localhost",
        "https://deep.app.localhost.:8443",
        "https://127.1",
        "https://127.0.0.2",
        "https://127.255.255.255",
        "https://0177.0.0.1",
        "https://0x7f.0.0.1",
        "https://0.0.0.0",
        "https://[::1]",
        "https://[::]",
        "https://[::ffff:127.0.0.1]",
    ],
)
def test_validate_settings_rejects_every_loopback_origin_variant(
    origin: str,
) -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
        cors_allow_origins=(origin,),
    )

    with pytest.raises(RuntimeError, match="CORS_ALLOW_ORIGINS"):
        validate_settings(config)


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "ftp://campus.example.edu",
        "campus.example.edu",
        "https:///missing-host",
        "https://user@campus.example.edu",
        "https://user:password@campus.example.edu",
        "https://campus.example.edu/course",
        "https://campus.example.edu?debug=true",
        "https://campus.example.edu#fragment",
        "http://campus.example.edu",
    ],
)
def test_validate_settings_rejects_invalid_or_non_https_production_origin(
    origin: str,
) -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
        cors_allow_origins=(origin,),
    )

    with pytest.raises(RuntimeError, match="CORS_ALLOW_ORIGINS"):
        validate_settings(config)


def test_validate_settings_rejects_local_origin_mixed_with_remote_https() -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
        cors_allow_origins=(
            "https://localhost:5173",
            "https://campus.example.edu",
        ),
    )

    with pytest.raises(RuntimeError, match="CORS_ALLOW_ORIGINS"):
        validate_settings(config)


def test_settings_drops_wildcard_and_invalid_configured_origins() -> None:
    config = Settings(
        cors_allow_origins=(
            "*",
            "not-a-url",
            "ftp://campus.example.edu",
            "http://127.0.0.1:5173",
        ),
    )

    # Invalid values (including "*") must never leak into the CORS allowlist.
    assert config.cors_allow_origins == ("http://127.0.0.1:5173",)


def test_settings_normalizes_valid_https_origin_host_port_and_trailing_dot() -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
        cors_allow_origins=(
            "HTTPS://CAMPUS.EXAMPLE.EDU.:443/",
            "https://API.Example.edu:8443",
        ),
    )

    assert config.cors_allow_origins == (
        "https://campus.example.edu",
        "https://api.example.edu:8443",
    )
    validate_settings(config)


def test_validate_settings_rejects_implicit_production_cors(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "x" * 32)
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    config = Settings()

    assert config.cors_allow_origins_explicit is False
    with pytest.raises(RuntimeError, match="CORS_ALLOW_ORIGINS"):
        validate_settings(config)


def test_settings_reads_environment_at_instance_creation_and_tracks_explicitness(
    monkeypatch,
) -> None:
    monkeypatch.setenv("JWT_SECRET_KEY", "first-" + "x" * 32)
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://first.example")
    first = Settings()

    monkeypatch.setenv("JWT_SECRET_KEY", "second-" + "x" * 32)
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://second.example")
    second = Settings()

    assert first.jwt_secret_key.startswith("first-")
    assert second.jwt_secret_key.startswith("second-")
    assert first.jwt_secret_key_explicit is True
    assert second.cors_allow_origins_explicit is True


def test_validate_settings_accepts_complete_production_configuration() -> None:
    config = Settings(
        app_env="production",
        jwt_secret_key="  " + "x" * 32 + "  ",
        access_token_expire_minutes=1440,
        cors_allow_origins=("https://campus.example.edu",),
    )

    validate_settings(config)
