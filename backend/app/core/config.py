from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "智行 CampusMind API"


settings = Settings()
