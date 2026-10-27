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
