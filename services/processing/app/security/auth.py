"""Local-only bearer token authentication.

The service binds to loopback only, but any process on the machine can
still reach a loopback port. The Electron main process generates a
random token per launch and passes it to both the Python service (via
environment variable) and the renderer (via the preload bridge, never
persisted to disk). Every request except /health must present it.
"""

from __future__ import annotations

import hmac

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.core.config import Settings, get_settings

_header_scheme = APIKeyHeader(name="Authorization", auto_error=False)


def require_service_token(
    authorization: str | None = Depends(_header_scheme),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = f"Bearer {settings.service_token}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing service token")
