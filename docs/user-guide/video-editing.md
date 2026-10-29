# Video Editing User Guide

The ReelForge AI Editor provides an intuitive timeline workspace combining AI-assisted planning with precise manual control.

## Editing Workflow

1. **Select or Create a Project**: Choose an existing project or create a new one from the Projects page.
2. **Import Source Footage**: Add your original clips to the Media Library. The app probes video resolution, frame rate, duration, and extracts thumbnails.
3. **Generate an Editing Plan**:
   - Choose a target duration (e.g. 15s, 30s, 60s).
   - Select an export preset: Vertical (1080×1920 9:16), Horizontal (1920×1080 16:9), or Square (1080×1080 1:1).
   - (Optional) Enter an **Editing Brief**, such as *"30 seconds vertical, fast cuts, avoid camera shake, keep original colors"*.
   - Click **Generate Timeline** or **Generate 3 alternative edits** to explore dynamic, cinematic, or balanced pacing styles.
4. **Timeline Adjustments**:
   - **Trim & Speed**: Adjust in/out points and playback speed (0.25x to 4x).
   - **Reorder & Remove**: Move clips up/down in the track sequence or remove unneeded cuts.
   - **Transitions**: Apply cuts, fades from black, or smooth audio/video crossfades with editable transition durations.
   - **Per-Clip Color Grading**: Tweak exposure, contrast, saturation, and temperature sliders.
   - **Stabilization**: Toggle per-clip conventional FFmpeg deshaking.
   - **Reframe Crop**: Adjust X/Y source crop offsets to center the subject in vertical 9:16 reels.
   - **Text Overlays & Subtitles**: Add timed captions with real-time 10% safe-area preview overlay.
5. **Undo / Redo & Checkpoints**:
   - Enjoy 50 steps of in-session Undo and Redo (`Ctrl+Z` / `Ctrl+Y`).
   - Saved project versions create permanent checkpoints; open the History panel to restore any earlier timeline version.
6. **Rendering & Export Quality Report**:
   - Click **Render** to launch background FFmpeg export.
   - When complete, the app runs an automated post-render QA scan for sustained black intervals, audio clipping, and EBU R128 integrated loudness (LUFS).
