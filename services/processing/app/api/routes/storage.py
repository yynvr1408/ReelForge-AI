from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import (
    Settings,
    get_settings,
    reset_storage_override,
    set_storage_override,
)
from app.security.auth import require_service_token

router = APIRouter(prefix="/storage", tags=["storage"], dependencies=[Depends(require_service_token)])


class StorageLocation(BaseModel):
    key: str
    label: str
    path: str
    is_custom: bool = False
    free_bytes: int | None = None
    total_bytes: int | None = None


class StorageLocationUpdateRequest(BaseModel):
    key: str
    path: str


class StorageLocationResetRequest(BaseModel):
    key: str


class StorageInfo(BaseModel):
    locations: list[StorageLocation]
    free_bytes: int
    total_bytes: int


class ClearCacheResult(BaseModel):
    reclaimed_bytes: int
    files_removed: int
    message: str


VALID_STORAGE_KEYS = {
    "projects": "Projects",
    "media": "Imported media",
    "reference": "Reference videos",
    "training_input": "Training input reels",
    "checkpoints": "Training checkpoints",
    "exports": "Rendered exports",
    "cache": "Cache",
}


def _build_storage_info(settings: Settings) -> StorageInfo:
    global_usage = shutil.disk_usage(settings.data_dir)
    items = [
        ("projects", "Projects", settings.projects_dir),
        ("media", "Imported media", settings.media_dir),
        ("reference", "Reference videos", settings.reference_dir),
        ("training_input", "Training input reels", settings.training_input_dir),
        ("checkpoints", "Training checkpoints", settings.checkpoints_dir),
        ("exports", "Rendered exports", settings.exports_dir),
        ("cache", "Cache", settings.cache_dir),
    ]
    locations = []
    for key, label, loc_path in items:
        free_bytes = None
        total_bytes = None
        try:
            target_to_probe = loc_path if loc_path.exists() else loc_path.parent
            loc_usage = shutil.disk_usage(target_to_probe)
            free_bytes = loc_usage.free
            total_bytes = loc_usage.total
        except Exception:
            pass
        locations.append(
            StorageLocation(
                key=key,
                label=label,
                path=str(loc_path),
                is_custom=settings.is_custom(key),
                free_bytes=free_bytes,
                total_bytes=total_bytes,
            )
        )
    return StorageInfo(locations=locations, free_bytes=global_usage.free, total_bytes=global_usage.total)


@router.get("", response_model=StorageInfo)
def get_storage_info(settings: Settings = Depends(get_settings)) -> StorageInfo:
    return _build_storage_info(settings)


@router.post("/location", response_model=StorageInfo)
def update_storage_location(
    payload: StorageLocationUpdateRequest,
    _auth=Depends(require_service_token),
) -> StorageInfo:
    if payload.key not in VALID_STORAGE_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid storage location key: {payload.key}")
    target_path = Path(payload.path).resolve()
    try:
        target_path.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot create or access directory: {exc}") from exc
    updated_settings = set_storage_override(payload.key, target_path)
    return _build_storage_info(updated_settings)


@router.post("/location/reset", response_model=StorageInfo)
def reset_storage_location(
    payload: StorageLocationResetRequest,
    _auth=Depends(require_service_token),
) -> StorageInfo:
    if payload.key not in VALID_STORAGE_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid storage location key: {payload.key}")
    updated_settings = reset_storage_override(payload.key)
    return _build_storage_info(updated_settings)


@router.post("/cache/clear", response_model=ClearCacheResult)
def clear_cache(settings: Settings = Depends(get_settings)) -> ClearCacheResult:
    reclaimed = 0
    removed_count = 0
    if settings.cache_dir.is_dir():
        for item in settings.cache_dir.iterdir():
            try:
                if item.is_file():
                    size = item.stat().st_size
                    item.unlink(missing_ok=True)
                    reclaimed += size
                    removed_count += 1
                elif item.is_dir():
                    size = sum(f.stat().st_size for f in item.glob("**/*") if f.is_file())
                    shutil.rmtree(item, ignore_errors=True)
                    reclaimed += size
                    removed_count += 1
            except Exception:
                continue

    return ClearCacheResult(
        reclaimed_bytes=reclaimed,
        files_removed=removed_count,
        message=f"Cleaned {removed_count} temporary items, reclaiming {reclaimed / (1024 * 1024):.2f} MB",
    )
