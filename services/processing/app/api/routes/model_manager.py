from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.model_manager.registry import get_model_manager_info
from app.security.auth import require_service_token

router = APIRouter(prefix="/models", tags=["models"], dependencies=[Depends(require_service_token)])


@router.get("")
def list_managed_models(settings: Settings = Depends(get_settings)) -> dict:
    return get_model_manager_info(settings.checkpoints_dir)
