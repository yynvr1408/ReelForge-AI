"""Path validation helpers.

Imported files and model outputs are untrusted. These helpers normalize
paths and reject traversal outside of allowed roots before any file
operation touches the filesystem.
"""

from __future__ import annotations

from pathlib import Path


class UnsafePathError(ValueError):
    pass


def resolve_within(root: Path, candidate: Path) -> Path:
    """Resolve `candidate` and ensure it is contained within `root`.

    Raises UnsafePathError if the resolved path escapes the root
    (e.g. via `..` segments or a symlink).
    """
    resolved_root = root.resolve()
    resolved_candidate = (root / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
    try:
        resolved_candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise UnsafePathError(f"Path {candidate} escapes allowed root {root}") from exc
    return resolved_candidate


def validate_source_file(path: Path) -> Path:
    """Validate a user-supplied source media path before it is read.

    The file must exist, be a regular file (not a symlink to a device,
    pipe, or directory), and be readable.
    """
    resolved = path.resolve()
    if not resolved.exists():
        raise UnsafePathError(f"File does not exist: {resolved}")
    if not resolved.is_file():
        raise UnsafePathError(f"Not a regular file: {resolved}")
    return resolved
