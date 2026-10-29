"""Socket-free end-to-end acceptance workflow through real route functions.

This complements the HTTP TestClient suite, which needs a Windows asyncio
self-pipe that the restricted desktop sandbox does not permit.
"""

from __future__ import annotations

import time

import pytest


def test_full_editing_vertical_slice(
    route_session, service_env, ffmpeg_path, ffprobe_path, synthetic_clip_factory, monkeypatch
):
    from fastapi import HTTPException

    import app.core.config as config_module
    from app.api.routes.projects import ProjectCreateRequest, ProjectUpdateRequest, create_project, get_project, update_project
    from app.api.routes.reference import ReferenceImportRequest, analyze_reference, import_reference
    from app.api.routes.render import RenderStartRequest, get_render_job, start_render
    from app.api.routes.style_profiles import StyleProfileCreateRequest, create_style_profile
    from app.api.routes.timeline import TimelineGenerateRequest, generate
    from app.core.config import Settings
    from app.database.models import RenderJob

    settings = Settings(service_env, ffmpeg_path, ffprobe_path, "test-token", "127.0.0.1", 0)
    monkeypatch.setattr(config_module, "_settings", settings)

    project = create_project(ProjectCreateRequest(name="Vertical slice"), route_session)

    reference_path = synthetic_clip_factory(duration_seconds=4, name="acceptance-reference", with_cuts=True)
    reference = import_reference(
        ReferenceImportRequest(source_path=str(reference_path)), route_session, settings
    )
    analyzed = analyze_reference(reference.id, route_session, settings)
    assert analyzed.analysis_status == "complete"
    assert analyzed.analysis_json["cut_count"] >= 1
    assert analyzed.analysis_json["visual"]["sample_count"] > 0

    profile = create_style_profile(
        StyleProfileCreateRequest(name="Acceptance profile", reference_ids=[reference.id]),
        route_session,
    )
    assert profile.profile_json["pacing"]["median_shot_duration_seconds"] > 0

    source_path = synthetic_clip_factory(
        duration_seconds=4, name="acceptance-source", color="blue", with_cuts=False
    )
    from app.api.routes.media import MediaImportRequest, import_media

    source = import_media(
        MediaImportRequest(project_id=project.id, source_path=str(source_path)),
        route_session,
        settings,
    )
    assert source.status == "imported"
    assert source.duration_seconds is not None

    proposed = generate(
        TimelineGenerateRequest(
            media_ids=[source.id],
            project_id=project.id,
            style_profile_id=profile.id,
            target_duration_seconds=3,
        ),
        route_session,
    )
    assert proposed["validation"]["is_valid"] is True
    timeline = proposed["timeline"]
    assert timeline["tracks"][0]["clips"]

    with pytest.raises(HTTPException) as unsafe_output:
        start_render(
            RenderStartRequest(project_id=project.id, timeline=timeline, output_filename="../outside.mp4"),
            route_session,
            settings,
        )
    assert unsafe_output.value.status_code == 422

    job = start_render(RenderStartRequest(project_id=project.id, timeline=timeline), route_session, settings)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        route_session.expire_all()
        saved_job = route_session.get(RenderJob, job.id)
        if saved_job and saved_job.status in {"complete", "failed", "cancelled"}:
            break
        time.sleep(0.25)
    else:
        raise TimeoutError(f"Render job {job.id} did not finish within 60 seconds")

    finished = get_render_job(job.id, route_session)
    assert finished.status == "complete", finished.error_message
    assert finished.validation_json["is_valid"] is True
    quality = finished.validation_json["quality_report"]
    assert quality["available"] is True
    assert isinstance(quality["warnings"], list)
    from pathlib import Path

    output_path = Path(finished.output_path)
    assert output_path.is_file() and output_path.stat().st_size > 0

    update_project(
        project.id,
        ProjectUpdateRequest(timeline_json=timeline, selected_style_profile_id=profile.id),
        route_session,
    )
    route_session.expire_all()
    reopened = get_project(project.id, route_session)
    assert reopened.timeline_json == timeline
    assert reopened.selected_style_profile_id == profile.id
