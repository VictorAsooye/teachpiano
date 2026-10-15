"""Pull audio out of a YouTube link with yt-dlp.

Runs on the server, never in the browser. We convert straight to mono 22 kHz
WAV because that is exactly what librosa wants, and it keeps a four-minute
song down to a few megabytes of scratch space.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg
import yt_dlp

# How much of a video we actually analyse. Long videos aren't refused -- we
# just read the first stretch of them, which for a song is the whole thing and
# for a two-hour mix is a fair sample.
MAX_ANALYSIS_SECONDS = 12 * 60
ANALYSIS_SAMPLE_RATE = 22050

# A backstop against pathological downloads (multi-hour stream archives). We
# still fetch the whole audio track before trimming, so this caps how much gets
# pulled over the wire, not how much is analysed.
MAX_SOURCE_SECONDS = 4 * 60 * 60

_YT_ID = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)


class DownloadError(RuntimeError):
    pass


def extract_video_id(url: str) -> str | None:
    match = _YT_ID.search(url or "")
    return match.group(1) if match else None


def normalize_url(url: str) -> str:
    video_id = extract_video_id(url)
    if not video_id:
        raise DownloadError("That doesn't look like a YouTube link.")
    return f"https://www.youtube.com/watch?v={video_id}"


def ffmpeg_exe() -> str:
    """Path to the ffmpeg binary that ships with imageio-ffmpeg (no system install)."""
    return imageio_ffmpeg.get_ffmpeg_exe()


def to_analysis_wav(source: Path, dest: Path, limit_seconds: float | None = None) -> Path:
    """Transcode whatever YouTube gave us into mono 22 kHz WAV, ready for librosa.

    We shell out to ffmpeg ourselves rather than using yt-dlp's postprocessor,
    which also insists on an ffprobe binary that imageio-ffmpeg doesn't ship.

    `limit_seconds` trims the output, so a long video costs us one short
    conversion and one short analysis instead of being turned away.
    """
    cmd = [
        ffmpeg_exe(), "-y", "-loglevel", "error",
        "-i", str(source),
        "-vn", "-ac", "1", "-ar", str(ANALYSIS_SAMPLE_RATE),
    ]
    if limit_seconds:
        cmd += ["-t", str(int(limit_seconds))]
    cmd.append(str(dest))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not dest.exists():
        raise DownloadError(f"Couldn't convert the audio: {result.stderr.strip()[:200]}")
    return dest


def probe(url: str) -> dict:
    """Fetch title/duration/thumbnail without downloading the audio."""
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(normalize_url(url), download=False)
    except yt_dlp.utils.DownloadError as exc:  # pragma: no cover - network dependent
        raise DownloadError(_friendly(str(exc))) from exc
    return {
        "video_id": info.get("id"),
        "title": info.get("title") or "Untitled",
        "uploader": info.get("uploader"),
        "duration": float(info.get("duration") or 0.0),
        "thumbnail": info.get("thumbnail"),
        "is_live": bool(info.get("is_live")),
    }


def download_audio(url: str, dest_dir: str | Path | None = None) -> tuple[Path, dict]:
    """Download the audio track. Returns (wav path, metadata)."""
    meta = probe(url)
    if meta.get("is_live"):
        raise DownloadError("That's a live stream, so there's no finished audio to analyse.")
    if meta["duration"] > MAX_SOURCE_SECONDS:
        raise DownloadError(
            f"That video is {meta['duration'] / 3600:.1f} hours long — too much to download."
        )

    # Long videos get read, not refused: we analyse the opening stretch.
    limit = MAX_ANALYSIS_SECONDS if meta["duration"] > MAX_ANALYSIS_SECONDS else None
    meta["truncated"] = limit is not None
    meta["analysed_seconds"] = float(limit) if limit else meta["duration"]

    dest = Path(dest_dir or tempfile.mkdtemp(prefix="songdecoder-"))
    dest.mkdir(parents=True, exist_ok=True)

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(dest / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(normalize_url(url), download=True)
    except yt_dlp.utils.DownloadError as exc:  # pragma: no cover - network dependent
        raise DownloadError(_friendly(str(exc))) from exc

    downloaded = _downloaded_path(info, dest)
    if downloaded is None:
        raise DownloadError("Downloaded the video but couldn't find the audio file.")

    wav = to_analysis_wav(downloaded, dest / f"{meta['video_id']}.wav", limit)
    if downloaded != wav:
        downloaded.unlink(missing_ok=True)
    return wav, meta


def _downloaded_path(info: dict, dest: Path) -> Path | None:
    requested = (info or {}).get("requested_downloads") or []
    for entry in requested:
        candidate = entry.get("filepath") or entry.get("_filename")
        if candidate and Path(candidate).exists():
            return Path(candidate)
    files = [f for f in dest.iterdir() if f.is_file()]
    return max(files, key=lambda f: f.stat().st_size) if files else None


def _friendly(message: str) -> str:
    lowered = message.lower()
    if "private" in lowered:
        return "That video is private."
    if "sign in" in lowered or "bot" in lowered:
        return "YouTube blocked the download (it wants a sign-in for this video)."
    if "unavailable" in lowered or "not available" in lowered:
        return "That video is unavailable."
    if "age" in lowered and "restrict" in lowered:
        return "That video is age-restricted, so it can't be downloaded."
    return "Couldn't download that video's audio."
