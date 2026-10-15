"""SQLite storage for the song library (feature #5).

One row per analysed video, keyed on the YouTube id so re-pasting a link that
someone already ran comes straight back out of the database instead of
re-downloading and re-analysing the whole track.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "songs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id         TEXT    NOT NULL UNIQUE,
    url              TEXT    NOT NULL,
    title            TEXT    NOT NULL,
    uploader         TEXT,
    thumbnail        TEXT,
    duration         REAL    NOT NULL,
    tempo            REAL,
    key_tonic        INTEGER NOT NULL,
    key_mode         TEXT    NOT NULL,
    key_name         TEXT    NOT NULL,
    key_confidence   REAL,
    key_use_flats    INTEGER NOT NULL DEFAULT 0,
    key_alternatives TEXT    NOT NULL DEFAULT '[]',
    chords           TEXT    NOT NULL DEFAULT '[]',
    category         TEXT    NOT NULL DEFAULT '',
    key_timeline     TEXT    NOT NULL DEFAULT '[]',
    full_duration    REAL,
    truncated        INTEGER NOT NULL DEFAULT 0,
    music_score      REAL    NOT NULL DEFAULT 1.0,
    is_music         INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_songs_created ON songs (created_at DESC);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


# Columns added after the first release. CREATE TABLE IF NOT EXISTS won't add
# them to a database that already exists, so they are patched in on startup.
MIGRATIONS = [
    ("key_timeline", "ALTER TABLE songs ADD COLUMN key_timeline TEXT NOT NULL DEFAULT '[]'"),
    ("category", "ALTER TABLE songs ADD COLUMN category TEXT NOT NULL DEFAULT ''"),
    ("full_duration", "ALTER TABLE songs ADD COLUMN full_duration REAL"),
    ("truncated", "ALTER TABLE songs ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0"),
    ("music_score", "ALTER TABLE songs ADD COLUMN music_score REAL NOT NULL DEFAULT 1.0"),
    ("is_music", "ALTER TABLE songs ADD COLUMN is_music INTEGER NOT NULL DEFAULT 1"),
]


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(songs)")}
        for column, statement in MIGRATIONS:
            if column not in existing:
                conn.execute(statement)


def _row_to_song(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "video_id": row["video_id"],
        "url": row["url"],
        "title": row["title"],
        "uploader": row["uploader"],
        "thumbnail": row["thumbnail"],
        "duration": row["duration"],
        # duration is what we analysed; full_duration is how long the video is.
        "full_duration": row["full_duration"] or row["duration"],
        "truncated": bool(row["truncated"]),
        "category": row["category"] or "",
        "tempo": row["tempo"],
        "key": {
            "tonic": row["key_tonic"],
            "mode": row["key_mode"],
            "name": row["key_name"],
            "confidence": row["key_confidence"],
            "use_flats": bool(row["key_use_flats"]),
            "alternatives": json.loads(row["key_alternatives"]),
        },
        "chords": json.loads(row["chords"]),
        "key_timeline": json.loads(row["key_timeline"] or "[]"),
        "music": {"score": row["music_score"], "is_music": bool(row["is_music"])},
        "created_at": row["created_at"],
    }


def save_song(meta: dict, analysis: dict) -> dict:
    """Insert or replace the analysis for one video. Returns the stored song."""
    key = analysis["key"]
    payload = (
        meta["video_id"],
        meta["url"],
        meta["title"],
        meta.get("uploader"),
        meta.get("thumbnail"),
        analysis["duration"],
        float(meta.get("duration") or analysis["duration"]),
        int(bool(meta.get("truncated"))),
        analysis.get("tempo"),
        key["tonic"],
        key["mode"],
        key["name"],
        key.get("confidence"),
        int(bool(key.get("use_flats"))),
        json.dumps(key.get("alternatives", [])),
        json.dumps(analysis["chords"]),
        json.dumps(analysis.get("key_timeline", [])),
        float(analysis.get("music", {}).get("score", 1.0)),
        int(bool(analysis.get("music", {}).get("is_music", True))),
        datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO songs (video_id, url, title, uploader, thumbnail, duration,
                               full_duration, truncated, tempo,
                               key_tonic, key_mode, key_name, key_confidence, key_use_flats,
                               key_alternatives, chords, key_timeline, music_score, is_music, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(video_id) DO UPDATE SET
                url=excluded.url, title=excluded.title, uploader=excluded.uploader,
                thumbnail=excluded.thumbnail, duration=excluded.duration,
                full_duration=excluded.full_duration, truncated=excluded.truncated,
                tempo=excluded.tempo,
                key_tonic=excluded.key_tonic, key_mode=excluded.key_mode,
                key_name=excluded.key_name, key_confidence=excluded.key_confidence,
                key_use_flats=excluded.key_use_flats,
                key_alternatives=excluded.key_alternatives, chords=excluded.chords,
                key_timeline=excluded.key_timeline,
                music_score=excluded.music_score, is_music=excluded.is_music,
                created_at=excluded.created_at
            """,
            payload,
        )
    found = get_by_video_id(meta["video_id"])
    assert found is not None
    return found


def get_by_video_id(video_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM songs WHERE video_id = ?", (video_id,)).fetchone()
    return _row_to_song(row) if row else None


def get(song_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
    return _row_to_song(row) if row else None


def list_songs(limit: int = 100) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM songs ORDER BY created_at DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_row_to_song(r) for r in rows]


def delete(song_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))
    return cur.rowcount > 0


def set_category(song_id: int, category: str) -> dict | None:
    """Tag a song. Categories are the user's own words, trimmed and capped.

    Not touched by save_song: re-analysing a song must not wipe its tag.
    """
    cleaned = (category or "").strip()[:40]
    with connect() as conn:
        cur = conn.execute("UPDATE songs SET category = ? WHERE id = ?", (cleaned, song_id))
    return get(song_id) if cur.rowcount else None


def categories() -> list[str]:
    """Every category in use, most-used first."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT category, COUNT(*) n FROM songs WHERE category != '' "
            "GROUP BY category ORDER BY n DESC, category ASC"
        ).fetchall()
    return [r["category"] for r in rows]
