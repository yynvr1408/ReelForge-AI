# Contributing

## Project structure and conventions

See [README.md](README.md) for the repo layout and [docs/development/setup.md](docs/development/setup.md) for environment setup.

- **Desktop app** (`apps/desktop/`): TypeScript strict mode, `oxlint`/`oxfmt` for linting/formatting (`npm run lint:fix`), React function components, Zustand for client state, Tailwind v4 for styling. Keep main/preload/renderer responsibilities separate — the renderer must never gain direct Node/filesystem/network access (see SECURITY.md).
- **Processing service** (`services/processing/`): Python 3.12, FastAPI + Pydantic + SQLAlchemy. New dependencies go in `pyproject.toml` with a version range, then `pip freeze > requirements-lock.txt` to record what actually resolved.

## Before submitting a change

1. `cd services/processing && ./.venv/Scripts/python -m pytest` — must pass
2. `cd apps/desktop && npm run typecheck && npm run lint` — must pass
3. If you touched the renderer, launch the app (`npm run start`) and manually exercise the affected screen — typechecking and backend tests don't verify UI behavior
4. Update `docs/development/implementation-log.md` and `docs/development/implementation-roadmap.md` if you changed what's implemented or discovered a limitation

## Scope discipline

This project follows the execution rules in `ReelForge_AI_Claude_Code_Master_Prompt.md` section 37: no nonfunctional placeholder features (mark unbuilt things as explicitly unavailable instead), no mock data standing in for real functionality outside of tests, no claiming something works without verifying it. If you build a feature partially, say so in known-limitations.md rather than leaving it to be discovered later.
