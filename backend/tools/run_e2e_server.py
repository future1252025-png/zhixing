import os
import sys
from datetime import datetime
from pathlib import Path
from tempfile import gettempdir
from zoneinfo import ZoneInfo


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
DATABASE_PATH = (
    Path(os.environ.get("CAMPUSMIND_E2E_DATA_DIR", gettempdir()))
    / "campusmind-e2e"
    / "campusmind-e2e.db"
)
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
for suffix in ("", "-wal", "-shm"):
    Path(f"{DATABASE_PATH}{suffix}").unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite:///{DATABASE_PATH.as_posix()}"
os.environ["CORS_ALLOW_ORIGINS"] = "http://127.0.0.1:5179"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
os.environ["APP_ENV"] = "development"

import uvicorn

from app.core.clock import get_current_time
from app.db.seed import initialize_database
from app.main import app


if __name__ == "__main__":
    initialize_database(os.environ["DATABASE_URL"])
    fixed_now = datetime(
        2026,
        9,
        21,
        7,
        0,
        tzinfo=ZoneInfo("Asia/Shanghai"),
    )
    app.dependency_overrides[get_current_time] = lambda: fixed_now
    uvicorn.run(app, host="127.0.0.1", port=8010)
