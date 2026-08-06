"""Lightweight in-memory sliding-window rate limiting (no external deps).

Good enough for the current single-process deployment; swap the module-level
limiters for a shared store (e.g. Redis) if the API ever runs multi-worker.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
import threading
import time


# User-facing throttle messages (Chinese, matching app.core.errors style).
LOGIN_RATE_LIMITED = "登录尝试过于频繁，请稍后再试"
REGISTER_RATE_LIMITED = "注册操作过于频繁，请稍后再试"


@dataclass
class SlidingWindowRateLimiter:
    """Thread-safe sliding-window failure counter keyed by opaque strings."""

    max_attempts: int
    window_seconds: float
    time_func: Callable[[], float] = time.monotonic
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _attempts: dict[str, deque[float]] = field(default_factory=dict, repr=False)

    def _pruned_bucket(self, key: str, now: float) -> deque[float] | None:
        """Drop entries older than the window; must be called under the lock."""
        bucket = self._attempts.get(key)
        if bucket is None:
            return None
        cutoff = now - self.window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if not bucket:
            del self._attempts[key]
            return None
        return bucket

    def is_limited(self, key: str) -> bool:
        now = self.time_func()
        with self._lock:
            bucket = self._pruned_bucket(key, now)
            return bucket is not None and len(bucket) >= self.max_attempts

    def record_failure(self, key: str) -> None:
        now = self.time_func()
        with self._lock:
            bucket = self._pruned_bucket(key, now)
            if bucket is None:
                bucket = deque()
                self._attempts[key] = bucket
            bucket.append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._attempts.clear()


# Failed logins are throttled on both dimensions: one client IP cannot spray
# many usernames, and one username cannot be brute-forced from many IPs.
# A successful login clears only that username's counter.
login_ip_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=60)
login_username_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=60)
# Registration counts failed attempts (identity collisions) per client IP.
# That is the username/student-id probing surface; the limit is looser than login.
register_ip_limiter = SlidingWindowRateLimiter(max_attempts=10, window_seconds=60)


def reset_all() -> None:
    """Clear every module-level limiter; intended for test isolation."""
    login_ip_limiter.reset()
    login_username_limiter.reset()
    register_ip_limiter.reset()
