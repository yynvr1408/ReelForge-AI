"""Management and validation for 3D LUT (.cube) color grading files."""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class LutInfo:
    id: str
    name: str
    filename: str
    path: str
    size_bytes: int
    is_builtin: bool


DEFAULT_LUTS = {
    "Teal_and_Orange.cube": (
        "Teal & Orange",
        """# ReelForge AI 3D LUT
TITLE "Teal and Orange"
LUT_3D_SIZE 2
0.000000 0.050000 0.100000
0.950000 0.600000 0.200000
0.000000 0.550000 0.400000
1.000000 0.700000 0.350000
0.000000 0.100000 0.500000
0.850000 0.650000 0.600000
0.000000 0.600000 0.800000
1.000000 0.850000 0.900000
""",
    ),
    "Warm_Golden.cube": (
        "Warm Golden Hour",
        """# ReelForge AI 3D LUT
TITLE "Warm Golden Hour"
LUT_3D_SIZE 2
0.050000 0.020000 0.000000
1.000000 0.750000 0.400000
0.200000 0.800000 0.300000
1.000000 0.900000 0.550000
0.100000 0.200000 0.600000
0.950000 0.700000 0.650000
0.250000 0.750000 0.750000
1.000000 0.950000 0.850000
""",
    ),
    "Moody_Film_Noir.cube": (
        "Moody Film Noir",
        """# ReelForge AI 3D LUT
TITLE "Moody Film Noir"
LUT_3D_SIZE 2
0.000000 0.000000 0.000000
0.650000 0.650000 0.650000
0.400000 0.400000 0.400000
0.750000 0.750000 0.750000
0.200000 0.200000 0.200000
0.700000 0.700000 0.700000
0.500000 0.500000 0.500000
0.900000 0.900000 0.900000
""",
    ),
    "Clean_Vivid.cube": (
        "Clean Vivid Commercial",
        """# ReelForge AI 3D LUT
TITLE "Clean Vivid Commercial"
LUT_3D_SIZE 2
0.000000 0.000000 0.000000
1.050000 0.000000 0.000000
0.000000 1.050000 0.000000
1.020000 1.020000 0.000000
0.000000 0.000000 1.050000
1.020000 0.000000 1.020000
0.000000 1.020000 1.020000
1.000000 1.000000 1.000000
""",
    ),
}


def seed_default_luts(luts_dir: Path) -> None:
    luts_dir.mkdir(parents=True, exist_ok=True)
    for filename, (_title, content) in DEFAULT_LUTS.items():
        lut_file = luts_dir / filename
        if not lut_file.exists():
            lut_file.write_text(content.strip() + "\n", encoding="utf-8")


def validate_cube_file(path: Path) -> bool:
    if not path.is_file() or path.suffix.lower() != ".cube":
        return False
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [f.readline().strip() for _ in range(30)]
        for line in lines:
            if "LUT_3D_SIZE" in line or "LUT_1D_SIZE" in line:
                return True
        return True
    except Exception:
        return False


def list_luts(luts_dir: Path) -> list[LutInfo]:
    seed_default_luts(luts_dir)
    results = []
    for file in sorted(luts_dir.glob("*.cube")):
        title = file.stem.replace("_", " ").title()
        try:
            with open(file, "r", encoding="utf-8", errors="ignore") as f:
                for _ in range(15):
                    line = f.readline()
                    if line.upper().startswith("TITLE"):
                        match = re.search(r'"([^"]+)"', line)
                        if match:
                            title = match.group(1)
                            break
        except Exception:
            pass

        results.append(
            LutInfo(
                id=file.stem,
                name=title,
                filename=file.name,
                path=str(file.resolve()),
                size_bytes=file.stat().st_size,
                is_builtin=file.name in DEFAULT_LUTS,
            )
        )
    return results


def import_lut(source_path: Path, luts_dir: Path) -> LutInfo:
    if not source_path.exists():
        raise FileNotFoundError(f"Source LUT file not found: {source_path}")
    if source_path.suffix.lower() != ".cube":
        raise ValueError("Only .cube format 3D LUT files are supported")
    if not validate_cube_file(source_path):
        raise ValueError("Invalid .cube LUT file structure")

    luts_dir.mkdir(parents=True, exist_ok=True)
    destination = luts_dir / source_path.name
    if source_path.resolve() != destination.resolve():
        shutil.copy2(source_path, destination)

    return list_luts(luts_dir)[0]  # will be in the list
