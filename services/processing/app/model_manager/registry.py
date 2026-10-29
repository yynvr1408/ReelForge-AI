"""Metadata and integrity checks for locally managed inference models."""

from __future__ import annotations

import hashlib
import os
import platform
from pathlib import Path

from app.training.pacing_model import MODEL_NAME, model_status, read_model


def _total_memory_bytes() -> int | None:
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("length", wintypes.DWORD),
                ("memory_load", wintypes.DWORD),
                ("total_physical", ctypes.c_ulonglong),
                ("available_physical", ctypes.c_ulonglong),
                ("total_page_file", ctypes.c_ulonglong),
                ("available_page_file", ctypes.c_ulonglong),
                ("total_virtual", ctypes.c_ulonglong),
                ("available_virtual", ctypes.c_ulonglong),
                ("available_extended_virtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return int(status.total_physical)
        return None
    if hasattr(os, "sysconf"):
        try:
            return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"))
        except (OSError, ValueError):
            return None
    return None


def get_model_manager_info(checkpoint_dir: Path) -> dict:
    active_path = checkpoint_dir / "pacing-active.json"
    active = read_model(active_path)
    active_summary = model_status(checkpoint_dir)["active"]
    checksum_path = active_path.with_suffix(active_path.suffix + ".sha256")
    integrity = "not-installed"
    file_sha256 = None
    size_bytes = None
    if active_path.exists():
        raw = active_path.read_bytes()
        file_sha256 = hashlib.sha256(raw).hexdigest()
        size_bytes = len(raw)
        integrity = "verified" if active is not None and checksum_path.is_file() and checksum_path.read_text(encoding="ascii").strip() == file_sha256 else "unverified"

    memory = _total_memory_bytes()
    model = {
        "id": MODEL_NAME,
        "name": "Pacing preference model",
        "status": "active" if active is not None else "not-installed",
        "integrity": integrity,
        "sha256": file_sha256,
        "size_bytes": size_bytes,
        "license": "MIT (ReelForge AI project license)",
        "runtime": "Python standard library; CPU",
        "compatibility": {"architectures": ["x86_64", "AMD64", "aarch64", "arm64"], "minimum_python": "3.12", "accelerator_required": False},
        "metrics": active_summary,
        "resource_policy": "Loaded from a small JSON checkpoint per timeline request; no accelerator or persistent model cache.",
    }
    return {
        "models": [model],
        "candidate": model_status(checkpoint_dir)["candidate"],
        "rollback_available": model_status(checkpoint_dir)["rollback_available"],
        "hardware": {
            "architecture": platform.machine(),
            "processor": platform.processor() or platform.machine(),
            "logical_cpu_count": os.cpu_count(),
            "memory_bytes": memory,
            "accelerator": "not required; CPU inference is supported",
        },
    }
