# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller build spec for the processing service. Produces a
# self-contained executable (no system Python required) that Electron's
# main process spawns directly in packaged builds — see
# apps/desktop/src/main/paths.ts and docs/releases/release-process.md.
#
# Rebuild with: ./.venv/Scripts/pyinstaller reelforge-processing.spec --noconfirm --clean
# Output: dist/reelforge-processing/ (reelforge-processing.exe + _internal/)
#
# `collect_all` is needed for scenedetect and cv2 because PyInstaller's
# static import analysis misses their dynamic imports/data files;
# without it the frozen exe fails at runtime with ImportError the
# first time scene analysis actually runs, not at startup — so always
# test a real reference-video analysis after rebuilding, not just that
# the exe launches.
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = [
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
]
for package in ('scenedetect', 'cv2'):
    pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hiddenimports

a = Analysis(
    ['app/main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='reelforge-processing',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='reelforge-processing',
)
