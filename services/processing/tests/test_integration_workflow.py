"""End-to-end test of the acceptance-criteria workflow (section 38 of
the product spec): create project -> import reference -> analyze ->
save style profile -> import source footage -> generate timeline ->
render -> validate output -> reopen project.
"""

from __future__ import annotations

import time


def _wait_for_job(client, job_id: str, timeout_seconds: float = 60.0) -> dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        response = client.get(f"/render/{job_id}")
        body = response.json()
        if body["status"] in ("complete", "failed", "cancelled"):
            return body
        time.sleep(0.25)
    raise TimeoutError(f"Render job {job_id} did not finish within {timeout_seconds}s")


def test_full_editing_workflow(app_client, synthetic_clip_factory):
    client = app_client

    # 1. Create a project.
    project = client.post("/projects", json={"name": "Test Reel"}).json()
    assert project["name"] == "Test Reel"

    # 2. Import a reference video and analyze it.
    reference_clip = synthetic_clip_factory(duration_seconds=4.0, name="reference", with_cuts=True)
    reference = client.post("/reference/import", json={"source_path": str(reference_clip)}).json()
    assert reference["analysis_status"] == "pending"

    analyzed = client.post(f"/reference/{reference['id']}/analyze").json()
    assert analyzed["analysis_status"] == "complete"
    assert analyzed["analysis_json"]["cut_count"] >= 1

    # 3. Save a style profile from the analyzed reference.
    profile = client.post(
        "/style-profiles", json={"name": "Fast Cuts", "reference_ids": [reference["id"]]}
    ).json()
    assert profile["profile_json"]["pacing"]["mean_shot_duration_seconds"] > 0

    # 4. Import source footage into the project.
    source_clip = synthetic_clip_factory(duration_seconds=3.0, name="source", color="blue", with_cuts=False)
    media = client.post(
        "/media/import", json={"project_id": project["id"], "source_path": str(source_clip)}
    ).json()
    assert media["status"] == "imported"
    assert media["duration_seconds"] is not None

    # 5. Generate a validated editing timeline using the style profile.
    generated = client.post(
        "/timeline/generate",
        json={
            "media_ids": [media["id"]],
            "style_profile_id": profile["id"],
            "target_duration_seconds": 3.0,
        },
    ).json()
    assert generated["validation"]["is_valid"] is True
    timeline = generated["timeline"]
    assert len(timeline["tracks"][0]["clips"]) >= 1

    # 6. Render the timeline.
    rejected_output = client.post(
        "/render/start",
        json={"project_id": project["id"], "timeline": timeline, "output_filename": "../outside.mp4"},
    )
    assert rejected_output.status_code == 422

    render_started = client.post(
        "/render/start", json={"project_id": project["id"], "timeline": timeline}
    ).json()
    assert render_started["status"] == "queued"

    finished = _wait_for_job(client, render_started["id"])
    assert finished["status"] == "complete", finished.get("error_message")
    assert finished["validation_json"]["is_valid"] is True
    assert finished["validation_json"]["quality_report"]["available"] is True
    assert isinstance(finished["validation_json"]["quality_report"]["warnings"], list)
    assert finished["output_path"]

    from pathlib import Path

    output_path = Path(finished["output_path"])
    assert output_path.exists()
    assert output_path.stat().st_size > 0

    # 7. Save the project with the generated timeline, then reopen it.
    client.patch(f"/projects/{project['id']}", json={"timeline_json": timeline, "selected_style_profile_id": profile["id"]})
    reopened = client.get(f"/projects/{project['id']}").json()
    assert reopened["timeline_json"] is not None
    assert reopened["selected_style_profile_id"] == profile["id"]
    assert len(reopened["timeline_json"]["tracks"][0]["clips"]) == len(timeline["tracks"][0]["clips"])


def test_requires_service_token(app_client):
    app_client.headers.pop("Authorization")
    response = app_client.get("/projects")
    assert response.status_code == 401


def test_health_does_not_require_token(app_client):
    app_client.headers.pop("Authorization")
    response = app_client.get("/health")
    assert response.status_code == 200
