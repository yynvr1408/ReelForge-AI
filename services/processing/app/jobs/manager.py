"""Background job execution for long-running work (rendering, analysis).

Jobs run on a thread pool so the FastAPI event loop (and therefore the
Electron renderer) is never blocked. Job state is persisted to the
database by the caller (e.g. RenderJob rows); this manager only owns
in-process execution and cancellation signaling.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field


@dataclass
class JobHandle:
    job_id: str
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def cancelled(self) -> bool:
        return self.cancel_event.is_set()


class JobManager:
    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="reelforge-job")
        self._handles: dict[str, JobHandle] = {}
        self._lock = threading.Lock()

    def submit(self, job_id: str, fn: Callable[[JobHandle], None]) -> JobHandle:
        handle = JobHandle(job_id=job_id)
        with self._lock:
            self._handles[job_id] = handle

        def _run():
            try:
                fn(handle)
            finally:
                with self._lock:
                    self._handles.pop(job_id, None)

        self._executor.submit(_run)
        return handle

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            handle = self._handles.get(job_id)
        if handle is None:
            return False
        handle.cancel_event.set()
        return True

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


_job_manager: JobManager | None = None


def get_job_manager() -> JobManager:
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
    return _job_manager
