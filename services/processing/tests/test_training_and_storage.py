from __future__ import annotations


def test_training_input_reels_lifecycle(app_client, synthetic_clip_factory):
    client = app_client

    assert client.get("/training/input-reels").json() == []

    clip = synthetic_clip_factory(duration_seconds=2.0, name="training_reel", with_cuts=False)
    imported = client.post("/training/input-reels/import", json={"source_path": str(clip)}).json()
    assert imported["duration_seconds"] is not None

    listed = client.get("/training/input-reels").json()
    assert len(listed) == 1
    assert listed[0]["filename"] == imported["filename"]

    deleted = client.delete(f"/training/input-reels/{imported['filename']}")
    assert deleted.status_code == 200
    assert client.get("/training/input-reels").json() == []


def test_storage_info_lists_known_locations(app_client):
    info = app_client.get("/storage").json()
    keys = {loc["key"] for loc in info["locations"]}
    assert {"projects", "media", "reference", "training_input", "checkpoints", "exports", "cache"} <= keys
    assert info["total_bytes"] > 0
