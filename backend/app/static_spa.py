from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles


def resolve_static_dir(explicit: str | None = None) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        return path if path.is_dir() else None
    repo_root = Path(__file__).resolve().parent.parent.parent
    dist = repo_root / "frontend" / "dist"
    return dist if dist.is_dir() else None


def mount_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve a Vite production build with SPA fallback (after API routes are registered)."""

    resolved_static_dir = static_dir.resolve()
    assets_dir = resolved_static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")

        if full_path:
            try:
                candidate = (resolved_static_dir / full_path).resolve()
                candidate.relative_to(resolved_static_dir)
                if candidate.is_file():
                    return FileResponse(candidate)
            except ValueError:
                pass

        index = resolved_static_dir / "index.html"
        if index.is_file():
            return FileResponse(index)

        raise HTTPException(status_code=404, detail="Not found")
