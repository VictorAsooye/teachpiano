"""Tiny in-process job queue.

Analysis takes tens of seconds -- far too long to hold an HTTP request open --
so /analyze hands back a job id and the frontend polls for progress.
"""

from __future__ import annotations

import shutil
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import db
from analysis.pipeline import analyze_file
from youtube import DownloadError, download_audio, extract_video_id

_jobs: dict[str, dict] = {}
_lock = threading.Lock()
# One at a time: the analysis is CPU-bound, and running several in parallel just
# makes every one of them slower.
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")


def _update(job_id: str, **fields) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def get(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def submit(url: str) -> dict:
    job_id = uuid.uuid4().hex[:12]
    job = {
        "id": job_id,
        "url": url,
        "status": "queued",
        "stage": "Waiting to start",
        "progress": 0.0,
        "song_id": None,
        "error": None,
    }
    with _lock:
        _jobs[job_id] = job
    _pool.submit(_run, job_id, url)
    return dict(job)


def _run(job_id: str, url: str) -> None:
    workdir = Path(tempfile.mkdtemp(prefix="songdecoder-"))
    try:
        _update(job_id, status="running", stage="Fetching audio from YouTube", progress=0.05)
        audio_path, meta = download_audio(url, workdir)
        meta["url"] = url

        _update(job_id, stage="Analysing audio", progress=0.25)

        def progress(stage: str, fraction: float) -> None:
            # Download is the first quarter of the job, analysis the rest.
            _update(job_id, stage=stage, progress=round(0.25 + 0.7 * fraction, 3))

        analysis = analyze_file(audio_path, progress)

        _update(job_id, stage="Saving to library", progress=0.97)
        song = db.save_song(meta, analysis)
        _update(job_id, status="done", stage="Done", progress=1.0, song_id=song["id"])
    except DownloadError as exc:
        _update(job_id, status="error", stage="Failed", error=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        _update(job_id, status="error", stage="Failed", error=f"Analysis failed: {exc}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def find_existing(url: str) -> dict | None:
    video_id = extract_video_id(url)
    return db.get_by_video_id(video_id) if video_id else None
