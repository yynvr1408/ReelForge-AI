"""Regression coverage for route logic without a local-socket TestClient."""

import pytest


def test_reference_collections_tags_and_exclusion(route_session):
    from app.api.routes.reference import (
        CollectionCreateRequest,
        ReferenceCollectionUpdateRequest,
        ReferenceUpdateRequest,
        create_collection,
        delete_collection,
        list_references,
        update_collection,
        update_reference,
    )
    from app.database.models import ReferenceVideo

    reference = ReferenceVideo(name="Ref", original_path="ref.mp4", storage_path="ref.mp4")
    route_session.add(reference)
    route_session.commit()
    collection = create_collection(CollectionCreateRequest(name="Travel"), route_session)
    renamed = update_collection(collection.id, ReferenceCollectionUpdateRequest(name="Trip"), route_session)
    assert renamed.name == "Trip"

    updated = update_reference(
        reference.id,
        ReferenceUpdateRequest(
            collection_id=collection.id,
            tags=["coast", "  sunset  "],
            excluded_from_aggregation=True,
        ),
        route_session,
    )
    assert updated.tags_json == ["coast", "sunset"]
    assert updated.excluded_from_aggregation is True
    assert list_references(
        search=None,
        collection_id=collection.id,
        tag="SUNSET",
        analysis_status=None,
        min_duration=None,
        max_duration=None,
        session=route_session,
    ) == [updated]
    assert delete_collection(collection.id, route_session) == {"deleted": True}
    assert route_session.get(ReferenceVideo, reference.id).collection_id is None


def test_style_profile_import_requires_supported_version_and_usable_pacing(route_session):
    from pydantic import ValidationError
    from app.api.routes.style_profiles import (
        StyleProfileImportRequest,
        StyleProfileUpdate,
        import_style_profile,
        update_style_profile,
    )

    payload = StyleProfileImportRequest(
        format="reelforge-style-profile",
        schema_version=1,
        name="Imported pacing",
        version=2,
        source_reference_ids=["source-reference"],
        profile_json={
            "pacing": {"median_shot_duration_seconds": 2.4},
            "visual": {"brightness_mean_0_255": 118.2},
        },
        confidence=0.7,
    )
    result = import_style_profile(payload, route_session)
    assert result.name == "Imported pacing"
    assert result.version == 2
    assert result.profile_json["pacing"]["median_shot_duration_seconds"] == 2.4
    assert result.source_reference_ids == ["source-reference"]
    updated = update_style_profile(
        result.id,
        StyleProfileUpdate(
            median_shot_duration_seconds=1.8,
            color={"exposure": 0.15, "contrast": -0.1, "saturation": 0.2, "temperature": 0.05},
        ),
        route_session,
    )
    assert updated.profile_json["pacing"]["median_shot_duration_seconds"] == 1.8
    assert updated.profile_json["user_adjustments"]["color"]["exposure"] == 0.15

    with pytest.raises(ValidationError, match="Unsupported style profile schema version"):
        StyleProfileImportRequest(
            format="reelforge-style-profile",
            schema_version=999,
            name="Unsupported",
            version=1,
            profile_json={"pacing": {"median_shot_duration_seconds": 2}},
            confidence=0.5,
        )
    with pytest.raises(ValidationError, match="between 0.3 and 30"):
        StyleProfileImportRequest(
            format="reelforge-style-profile",
            schema_version=1,
            name="Invalid pacing",
            version=1,
            profile_json={"pacing": {"median_shot_duration_seconds": 60}},
            confidence=0.5,
        )


def test_explicit_export_preset_wins_over_brief_aspect(route_session):
    from app.api.routes.timeline import TimelineGenerateRequest, generate
    from app.database.models import MediaAsset
    from app.timeline.schema import ExportSettings

    asset = MediaAsset(
        kind="video",
        original_path="source.mp4",
        storage_path="missing-source.mp4",
        duration_seconds=4,
        has_audio=False,
    )
    route_session.add(asset)
    route_session.commit()

    result = generate(
        TimelineGenerateRequest(
            media_ids=[asset.id],
            editing_brief="square format",
            export_settings=ExportSettings(width=1920, height=1080),
        ),
        route_session,
    )
    assert result["timeline"]["export_settings"]["width"] == 1920
    assert result["timeline"]["export_settings"]["height"] == 1080


def test_media_library_pages_are_stable_and_revalidate_only_returned_assets(route_session, tmp_path):
    from app.api.routes.media import list_media_page
    from app.database.models import MediaAsset

    assets = [
        MediaAsset(
            kind="video",
            original_path=f"source-{index}.mp4",
            storage_path=str(tmp_path / f"missing-{index}.mp4"),
            status="imported",
        )
        for index in range(5)
    ]
    route_session.add_all(assets)
    route_session.commit()

    first = list_media_page(None, 2, 0, route_session)
    second = list_media_page(None, 2, 2, route_session)

    assert first["total"] == second["total"] == 5
    assert first["limit"] == 2 and second["offset"] == 2
    assert len(first["items"]) == len(second["items"]) == 2
    assert {asset.id for asset in first["items"]}.isdisjoint({asset.id for asset in second["items"]})
    assert all(asset.status == "missing" for asset in [*first["items"], *second["items"]])


def test_preserve_original_colors_brief_overrides_profile_grade(route_session):
    from app.api.routes.timeline import TimelineGenerateRequest, generate
    from app.database.models import MediaAsset, StyleProfile

    asset = MediaAsset(
        kind="video",
        original_path="source.mp4",
        storage_path="missing-source.mp4",
        duration_seconds=4,
        has_audio=False,
    )
    profile = StyleProfile(
        name="Warm grade",
        profile_json={"user_adjustments": {"color": {"exposure": 0.5, "saturation": 0.4}}},
    )
    route_session.add_all([asset, profile])
    route_session.commit()

    result = generate(
        TimelineGenerateRequest(
            media_ids=[asset.id],
            style_profile_id=profile.id,
            editing_brief="keep original colors",
        ),
        route_session,
    )

    color = result["timeline"]["tracks"][0]["clips"][0]["color"]
    assert color == {"exposure": 0.0, "contrast": 0.0, "saturation": 0.0, "temperature": 0.0}
    assert result["interpretation"]["preserve_original_colors"] is True
    assert result["preference_adjustment"]["color_feedback_overridden_by_brief"] is True


def test_reference_similarity_ranks_shared_measured_style_signals(route_session):
    from app.api.routes.reference import find_similar_references
    from app.database.models import ReferenceVideo

    reference_analysis = {
        "duration_seconds": 30,
        "cut_count": 20,
        "mean_shot_duration_seconds": 1.5,
        "visual": {
            "brightness_mean_0_255": 120,
            "saturation_mean_0_255": 90,
            "sharpness_laplacian_variance_median": 300,
            "motion_magnitude_median": 2,
        },
        "audio": {
            "duration_seconds": 30,
            "silence_ranges_seconds": [[0, 3]],
            "speech_like_ranges_seconds": [[5, 15]],
            "transient_candidates_seconds": [2, 4, 6],
            "beat_candidates_seconds": [1, 3, 5, 7],
            "tempo_candidates_bpm": [{"bpm": 120, "confidence": 0.6}],
        },
    }
    close_analysis = {
        "duration_seconds": 28,
        "cut_count": 19,
        "mean_shot_duration_seconds": 1.55,
        "visual": {
            "brightness_mean_0_255": 122,
            "saturation_mean_0_255": 92,
            "sharpness_laplacian_variance_median": 310,
            "motion_magnitude_median": 2.1,
        },
        "audio": {
            "duration_seconds": 28,
            "silence_ranges_seconds": [[0, 2.5]],
            "speech_like_ranges_seconds": [[5, 14]],
            "transient_candidates_seconds": [2, 4, 6],
            "beat_candidates_seconds": [1, 3, 5, 7],
            "tempo_candidates_bpm": [{"bpm": 118, "confidence": 0.6}],
        },
    }
    distant_analysis = {
        "duration_seconds": 30,
        "cut_count": 2,
        "mean_shot_duration_seconds": 8,
        "visual": {
            "brightness_mean_0_255": 35,
            "saturation_mean_0_255": 230,
            "sharpness_laplacian_variance_median": 25,
            "motion_magnitude_median": 8,
        },
        "audio": {
            "duration_seconds": 30,
            "silence_ranges_seconds": [[0, 15]],
            "speech_like_ranges_seconds": [],
            "transient_candidates_seconds": [1, 20],
            "beat_candidates_seconds": [],
            "tempo_candidates_bpm": [{"bpm": 70, "confidence": 0.4}],
        },
    }
    references = [
        ReferenceVideo(name="Anchor", original_path="a.mp4", storage_path="a.mp4", analysis_status="complete", analysis_json=reference_analysis),
        ReferenceVideo(name="Close style", original_path="b.mp4", storage_path="b.mp4", analysis_status="complete", analysis_json=close_analysis),
        ReferenceVideo(name="Distant style", original_path="c.mp4", storage_path="c.mp4", analysis_status="complete", analysis_json=distant_analysis),
    ]
    route_session.add_all(references)
    route_session.commit()

    results = find_similar_references(references[0].id, 10, route_session)

    assert [item["reference_id"] for item in results] == [references[1].id, references[2].id]
    assert results[0]["similarity_score"] > results[1]["similarity_score"]
    assert "brightness" in results[0]["shared_signals"]
    assert "sharpness" in results[0]["shared_signals"]


def test_reference_missing_file_can_be_relinked_and_analysis_is_invalidated(
    route_session, service_env, ffmpeg_path, ffprobe_path, tmp_path, monkeypatch
):
    from types import SimpleNamespace

    from app.api.routes import reference as reference_routes
    from app.api.routes.reference import ReferenceRelinkRequest, relink_reference
    from app.core.config import Settings
    from app.database.models import ReferenceVideo

    managed_path = tmp_path / "replacement.mp4"
    managed_path.write_bytes(b"video")
    probe = SimpleNamespace(
        duration_seconds=12.5,
        width=1920,
        height=1080,
        frame_rate=30.0,
        raw={"streams": [{"codec_type": "video"}]},
    )
    replacement = SimpleNamespace(
        kind="video",
        original_path=tmp_path / "replacement.mp4",
        storage_path=managed_path,
        probe=probe,
        thumbnail_path=None,
    )
    monkeypatch.setattr(reference_routes, "import_media_file", lambda *args: replacement)
    reference = ReferenceVideo(
        name="Moved reference",
        original_path="old.mp4",
        storage_path=str(tmp_path / "missing.mp4"),
        analysis_status="complete",
        analysis_json={"cut_count": 3},
    )
    route_session.add(reference)
    route_session.commit()
    assert reference.file_missing is True

    updated = relink_reference(
        reference.id,
        ReferenceRelinkRequest(source_path="replacement.mp4"),
        route_session,
        Settings(service_env, ffmpeg_path, ffprobe_path, "test-token", "127.0.0.1", 0),
    )

    assert updated.file_missing is False
    assert updated.duration_seconds == 12.5
    assert updated.width == 1920 and updated.height == 1080
    assert updated.analysis_status == "pending"
    assert updated.analysis_json is None

def test_reference_list_paginates_after_filters_including_json_tags(route_session):
    from app.api.routes.reference import list_references
    from app.database.models import ReferenceVideo

    references = [
        ReferenceVideo(
            name=f"Ref {index}",
            original_path=f"ref-{index}.mp4",
            storage_path=f"ref-{index}.mp4",
            tags_json=["travel"] if index != 1 else ["archive"],
        )
        for index in range(4)
    ]
    route_session.add_all(references)
    route_session.commit()

    first_page = list_references(
        search=None, collection_id=None, tag="TRAVEL", analysis_status=None,
        min_duration=None, max_duration=None, limit=2, offset=0, session=route_session,
    )
    second_page = list_references(
        search=None, collection_id=None, tag="TRAVEL", analysis_status=None,
        min_duration=None, max_duration=None, limit=2, offset=2, session=route_session,
    )
    assert len(first_page) == 2
    assert len(second_page) == 1
    assert {item.id for item in first_page}.isdisjoint({item.id for item in second_page})


def test_project_versions_restore_and_feedback_crud(route_session):
    from app.api.routes.feedback import FeedbackCreateRequest, create_feedback, delete_feedback, list_feedback
    from app.api.routes.projects import ProjectCreateRequest, ProjectUpdateRequest, create_project, list_project_versions, restore_project_version, update_project

    project = create_project(ProjectCreateRequest(name="Versioned"), route_session)
    first_versions = list_project_versions(project.id, route_session)
    assert first_versions[0].version_number == 1

    first_timeline = {"tracks": [{"id": "video-track", "clips": [{"id": "clip-a"}]}]}
    update_project(
        project.id,
        ProjectUpdateRequest(name="Edited", timeline_json=first_timeline),
        route_session,
    )
    saved_versions = list_project_versions(project.id, route_session)
    assert saved_versions[0].snapshot_json["timeline_json"] == first_timeline
    update_project(project.id, ProjectUpdateRequest(timeline_json={"tracks": []}), route_session)
    versions = list_project_versions(project.id, route_session)
    assert len(versions) == 3

    restored = restore_project_version(project.id, saved_versions[0].id, route_session)
    assert restored.name == "Edited"
    assert restored.timeline_json == first_timeline
    assert len(list_project_versions(project.id, route_session)) == 4

    feedback = create_feedback(
        FeedbackCreateRequest(project_id=project.id, subject="timeline_pacing", action="too_fast"),
        route_session,
    )
    assert list_feedback(project_id=project.id, limit=100, session=route_session)[0].id == feedback.id
    assert delete_feedback(feedback.id, route_session) == {"deleted": True}


def test_reference_analysis_job_can_be_cancelled_and_persists_terminal_state(
    route_session, service_env, ffmpeg_path, ffprobe_path, monkeypatch
):
    from app.api.routes import reference as reference_routes
    from app.core.config import Settings
    from app.database.models import ReferenceAnalysisJob, ReferenceVideo
    from app.jobs.manager import JobHandle

    class CapturedJobManager:
        def __init__(self):
            self.callback = None
            self.handle = None

        def is_active(self, job_id):
            return False

        def submit(self, job_id, callback):
            self.handle = JobHandle(job_id)
            self.callback = callback

        def cancel(self, job_id):
            if job_id != self.handle.job_id:
                return False
            self.handle.cancel_event.set()
            return True

    manager = CapturedJobManager()
    monkeypatch.setattr(reference_routes, "get_job_manager", lambda: manager)
    monkeypatch.setattr(reference_routes, "_collect_analysis", lambda *args, **kwargs: {"cut_count": 1})
    settings = Settings(service_env, ffmpeg_path, ffprobe_path, "test-token", "127.0.0.1", 0)
    reference = ReferenceVideo(name="Cancelable", original_path="source.mp4", storage_path="source.mp4")
    route_session.add(reference)
    route_session.commit()

    job = reference_routes.start_reference_analysis(reference.id, route_session, settings)
    assert job.status == "queued"
    requested = reference_routes.cancel_reference_analysis_job(job.id, route_session)
    assert requested.status == "queued"
    manager.callback(manager.handle)

    route_session.expire_all()
    saved_job = route_session.get(ReferenceAnalysisJob, job.id)
    saved_reference = route_session.get(ReferenceVideo, reference.id)
    assert saved_job.status == "cancelled"
    assert saved_job.stage == "cancelled"
    assert saved_reference.analysis_status == "cancelled"


def test_reference_analysis_job_completes_and_saves_results(
    route_session, service_env, ffmpeg_path, ffprobe_path, monkeypatch
):
    from app.api.routes import reference as reference_routes
    from app.core.config import Settings
    from app.database.models import ReferenceAnalysisJob, ReferenceVideo
    from app.jobs.manager import JobHandle

    class CapturedJobManager:
        def is_active(self, job_id):
            return False

        def submit(self, job_id, callback):
            callback(JobHandle(job_id))

    monkeypatch.setattr(reference_routes, "get_job_manager", lambda: CapturedJobManager())
    monkeypatch.setattr(reference_routes, "_collect_analysis", lambda *args, **kwargs: {"cut_count": 2})
    settings = Settings(service_env, ffmpeg_path, ffprobe_path, "test-token", "127.0.0.1", 0)
    reference = ReferenceVideo(name="Analyzed", original_path="source.mp4", storage_path="source.mp4")
    route_session.add(reference)
    route_session.commit()

    job = reference_routes.start_reference_analysis(reference.id, route_session, settings)
    route_session.expire_all()
    saved_job = route_session.get(ReferenceAnalysisJob, job.id)
    saved_reference = route_session.get(ReferenceVideo, reference.id)
    assert saved_job.status == "complete"
    assert saved_job.stage == "complete"
    assert saved_reference.analysis_status == "complete"
    assert saved_reference.analysis_json == {"cut_count": 2}


def test_analysis_job_schema_migration_backs_up_version_two_database(tmp_path):
    import sqlite3

    from app.database.session import CURRENT_SCHEMA_VERSION, init_database

    database = tmp_path / "existing.sqlite3"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT, description TEXT)")
        connection.execute("INSERT INTO schema_migrations (version, description) VALUES (2, 'prior schema')")
        connection.commit()

    engine = init_database(database)
    with sqlite3.connect(database) as connection:
        versions = {row[0] for row in connection.execute("SELECT version FROM schema_migrations")}
        analysis_job_table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reference_analysis_jobs'"
        ).fetchone()
        training_job_table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='training_jobs'"
        ).fetchone()
    backups = list((tmp_path / "backups").glob("reelforge-pre-migration-v2*.sqlite3"))
    assert CURRENT_SCHEMA_VERSION == 4
    assert versions == {2, CURRENT_SCHEMA_VERSION}
    assert analysis_job_table is not None
    assert training_job_table is not None
    assert len(backups) == 1


def test_service_startup_marks_interrupted_reference_analysis_failed(route_session):
    from app.api.app import _recover_interrupted_analysis_jobs
    from app.database.models import ReferenceAnalysisJob, ReferenceVideo

    reference = ReferenceVideo(
        name="Interrupted", original_path="source.mp4", storage_path="source.mp4", analysis_status="running"
    )
    route_session.add(reference)
    route_session.commit()
    job = ReferenceAnalysisJob(reference_id=reference.id, status="running", stage="visual_analysis")
    route_session.add(job)
    route_session.commit()

    _recover_interrupted_analysis_jobs()
    route_session.expire_all()
    assert route_session.get(ReferenceAnalysisJob, job.id).status == "failed"
    assert route_session.get(ReferenceVideo, reference.id).analysis_status == "failed"

    from app.database.models import TrainingJob

    training_job = TrainingJob(status="running", stage="training_model")
    route_session.add(training_job)
    route_session.commit()
    _recover_interrupted_analysis_jobs()
    route_session.expire_all()
    recovered = route_session.get(TrainingJob, training_job.id)
    assert recovered.status == "failed"
    assert recovered.error_message == "Training was interrupted when the processing service stopped"


def test_training_job_reports_progress_and_can_be_cancelled(route_session, service_env, ffmpeg_path, ffprobe_path, monkeypatch):
    from app.api.routes import training as training_routes
    from app.core.config import Settings
    from app.database.models import FeedbackEntry, TrainingJob
    from app.jobs.manager import JobHandle

    class CapturedJobManager:
        def __init__(self):
            self.callbacks = {}
            self.handles = {}

        def is_active(self, job_id):
            return job_id in self.handles

        def submit(self, job_id, callback):
            handle = JobHandle(job_id)
            self.handles[job_id] = handle
            self.callbacks[job_id] = callback

        def cancel(self, job_id):
            handle = self.handles.get(job_id)
            if handle is None:
                return False
            handle.cancel_event.set()
            return True

    manager = CapturedJobManager()
    monkeypatch.setattr(training_routes, "get_job_manager", lambda: manager)
    for index in range(8):
        route_session.add(
            FeedbackEntry(
                subject="timeline_pacing",
                action="too_fast" if index % 2 else "too_slow",
                payload_json={"target_duration_seconds": 20 + index * 5, "clip_count": 4 + index},
            )
        )
    route_session.commit()
    settings = Settings(service_env, ffmpeg_path, ffprobe_path, "test-token", "127.0.0.1", 0)

    started = training_routes.start_pacing_training(settings, route_session)
    manager.callbacks[started["id"]](manager.handles[started["id"]])
    route_session.expire_all()
    completed = route_session.get(TrainingJob, started["id"])
    assert completed.status == "complete"
    assert completed.stage == "complete"
    assert completed.progress == 1.0
    assert completed.candidate_json["sample_count"] == 8

    cancelled_start = training_routes.start_pacing_training(settings, route_session)
    request = training_routes.cancel_pacing_training(cancelled_start["id"], route_session)
    assert request["status"] == "cancel_requested"
    manager.callbacks[cancelled_start["id"]](manager.handles[cancelled_start["id"]])
    route_session.expire_all()
    cancelled = route_session.get(TrainingJob, cancelled_start["id"])
    assert cancelled.status == "cancelled"


def test_batch_media_import_recurses_and_reports_bad_files(
    route_session, service_env, ffmpeg_path, ffprobe_path, synthetic_clip_factory, tmp_path
):
    from app.api.routes.media import MediaBatchImportRequest, import_media_batch
    from app.core.config import Settings

    source_dir = tmp_path / "camera-roll"
    source_dir.mkdir()
    valid = synthetic_clip_factory(duration_seconds=1, name="batch-valid", with_cuts=False)
    (source_dir / "nested").mkdir()
    (source_dir / "nested" / "valid.mp4").write_bytes(valid.read_bytes())
    (source_dir / "broken.mp4").write_text("not a video", encoding="utf-8")
    (source_dir / "notes.txt").write_text("ignored", encoding="utf-8")
    settings = Settings(service_env, ffmpeg_path, ffprobe_path, "test-token", "127.0.0.1", 0)
    settings.ensure_directories()

    results = import_media_batch(
        MediaBatchImportRequest(source_paths=[str(source_dir)]),
        session=route_session,
        settings=settings,
    )
    assert len(results) == 2
    assert sum(result["media"] is not None for result in results) == 1
    assert sum(result["error"] is not None for result in results) == 1
