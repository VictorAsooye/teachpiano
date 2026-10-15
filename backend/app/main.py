"""FastAPI app: paste a YouTube link, get back the key, the chords, and the scale."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

import db  # noqa: E402
import jobs  # noqa: E402
from playback import build_playback, unique_chords  # noqa: E402
from youtube import extract_video_id  # noqa: E402

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    yield


app = FastAPI(title="Song Decoder", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)



class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="A YouTube video link")
    force: bool = Field(False, description="Re-analyse even if the song is already saved")


def _summary(song: dict) -> dict:
    return {
        "id": song["id"],
        "video_id": song["video_id"],
        "url": song["url"],
        "title": song["title"],
        "uploader": song["uploader"],
        "thumbnail": song["thumbnail"],
        "duration": song["duration"],
        "full_duration": song.get("full_duration", song["duration"]),
        "truncated": song.get("truncated", False),
        "category": song.get("category", ""),
        "tempo": song["tempo"],
        "key": song["key"],
        "key_timeline": song.get("key_timeline", []),
        "modulates": len(song.get("key_timeline", [])) > 1,
        "music": song.get("music", {"score": 1.0, "is_music": True}),
        "chord_count": len(song["chords"]),
        "unique_chords": unique_chords(song),
        "created_at": song["created_at"],
    }


def _detail(song: dict) -> dict:
    return {**_summary(song), "playback": build_playback(song)}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict:
    if not extract_video_id(request.url):
        raise HTTPException(status_code=400, detail="That doesn't look like a YouTube link.")

    if not request.force:
        # Feature #5: anything already in the library replays instantly.
        existing = jobs.find_existing(request.url)
        if existing:
            return {"status": "cached", "song": _detail(existing)}

    return {"status": "queued", "job": jobs.submit(request.url)}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job")
    if job["status"] == "done" and job["song_id"]:
        song = db.get(job["song_id"])
        if song:
            return {**job, "song": _detail(song)}
    return job


class CategoryRequest(BaseModel):
    category: str = Field("", description="Free-text tag; empty clears it")


@app.get("/api/songs")
def list_songs() -> dict:
    return {"songs": [_summary(s) for s in db.list_songs()], "categories": db.categories()}


@app.put("/api/songs/{song_id}/category")
def set_category(song_id: int, request: CategoryRequest) -> dict:
    song = db.set_category(song_id, request.category)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return _summary(song)


@app.get("/api/songs/{song_id}")
def get_song(song_id: int) -> dict:
    song = db.get(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return _detail(song)


@app.delete("/api/songs/{song_id}")
def delete_song(song_id: int) -> dict:
    if not db.delete(song_id):
        raise HTTPException(status_code=404, detail="Song not found")
    return {"deleted": song_id}


# Serve the built React app from the API itself, so the whole thing is one
# server on one URL and the launcher has a single thing to start. Mounted last
# so every /api route above wins; in development Vite serves the UI instead and
# proxies /api here, and this mount simply doesn't exist.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="ui")
