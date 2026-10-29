from __future__ import annotations

import shutil

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.security.auth import require_service_token

router = APIRouter(prefix="/storage", tags=["storage"], dependencies=[Depends(require_service_token)])


class StorageLocation(BaseModel):
    key: str
    label: str
    path: str


class StorageInfo(BaseModel):
    locations: list[StorageLocation]
    free_bytes: int
    total_bytes: int


class ClearCacheResult(BaseModel):
    reclaimed_bytes: int
    files_removed: int
    message: str


@router.get("", response_model=StorageInfo)
def get_storage_info(settings: Settings = Depends(get_settings)) -> StorageInfo:
    usage = shutil.disk_usage(settings.data_dir)
    locations = [
        StorageLocation(key="projects", label="Projects", path=str(settings.projects_dir)),
        StorageLocation(key="media", label="Imported media", path=str(settings.media_dir)),
        StorageLocation(key="reference", label="Reference videos", path=str(settings.reference_dir)),
        StorageLocation(key="training_input", label="Training input reels", path=str(settings.training_input_dir)),
        StorageLocation(key="checkpoints", label="Training checkpoints", path=str(settings.checkpoints_dir)),
        StorageLocation(key="exports", label="Rendered exports", path=str(settings.exports_dir)),
        StorageLocation(key="cache", label="Cache", path=str(settings.cache_dir)),
    ]
    return StorageInfo(locations=locations, free_bytes=usage.free, total_bytes=usage.total)


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
