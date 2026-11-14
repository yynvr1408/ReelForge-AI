from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.rendering.lut_manager import LutInfo, import_lut as do_import_lut, list_luts as do_list_luts
from app.security.auth import require_service_token

router = APIRouter(prefix="/luts", tags=["luts"], dependencies=[Depends(require_service_token)])


class LutResponse(BaseModel):
    id: str
    name: str
    filename: str
    path: str
    size_bytes: int
    is_builtin: bool


class LutImportRequest(BaseModel):
    source_path: str


@router.get("", response_model=list[LutResponse])
def get_luts(settings: Settings = Depends(get_settings)) -> list[LutResponse]:
    luts = do_list_luts(settings.luts_dir)
    return [
        LutResponse(
            id=lut.id,
            name=lut.name,
            filename=lut.filename,
            path=lut.path,
            size_bytes=lut.size_bytes,
            is_builtin=lut.is_builtin,
        )
        for lut in luts
    ]


@router.post("/import", response_model=LutResponse)
def import_lut_file(
    payload: LutImportRequest,
    settings: Settings = Depends(get_settings),
) -> LutResponse:
    try:
        source = Path(payload.source_path)
        do_import_lut(source, settings.luts_dir)
        # find the imported one
        all_luts = do_list_luts(settings.luts_dir)
        matched = next((l for l in all_luts if l.filename == source.name), all_luts[0])
        return LutResponse(
            id=matched.id,
            name=matched.name,
            filename=matched.filename,
            path=matched.path,
            size_bytes=matched.size_bytes,
            is_builtin=matched.is_builtin,
        )
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to import LUT: {err}")
