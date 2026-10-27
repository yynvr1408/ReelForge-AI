"""Entry point for the processing service.

Launched as a subprocess by the Electron main process, which sets the
required REELFORGE_* environment variables before spawning this
process and reads the printed readiness line to confirm startup.
"""

from __future__ import annotations

import sys

import uvicorn

from app.api.app import create_app
from app.core.config import ConfigurationError, get_settings


def main() -> None:
    try:
        settings = get_settings()
    except ConfigurationError as exc:
        print(f"FATAL: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)

    app = create_app()
    print(f"REELFORGE_SERVICE_READY port={settings.port}", flush=True)
    uvicorn.run(app, host=settings.host, port=settings.port, log_config=None)


if __name__ == "__main__":
    main()
