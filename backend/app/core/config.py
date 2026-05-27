from dataclasses import dataclass
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "campusmind.db"


@dataclass(frozen=True)
class Settings:
    app_name: str = "智行 CampusMind API"
    database_url: str = f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"


settings = Settings()
