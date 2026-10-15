"""Audio -> {key, chords}. Ties librosa feature extraction to the two detectors."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Callable

import librosa
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from theory import key_prefers_flats, note_name  # noqa: E402

from .chords import decode  # noqa: E402
from .music_check import assess  # noqa: E402
from .key_detect import detect_key, detect_key_timeline  # noqa: E402

SAMPLE_RATE = 22050
HOP_LENGTH = 512
FALLBACK_WINDOW = 0.5  # seconds, used when beat tracking gives up

Progress = Callable[[str, float], None]


def _noop(stage: str, fraction: float) -> None:
    pass


def _chroma(y: np.ndarray, sr: int, tuning: float) -> np.ndarray:
    """Harmonic-only CQT chroma, smoothed so drums and transients don't dominate.

    `tuning` must be measured on the *full* mix and passed in. Left to itself,
    chroma_cqt re-estimates tuning from whatever it is handed -- here the
    harmonic residue, which has had content removed and gives a worse estimate.
    On a trap beat that error was 2 cents, which was enough to shift the chroma
    and hand the key to Db major over the correct F minor on a 2% margin.
    """
    y_harmonic = librosa.effects.harmonic(y, margin=3.0)
    chroma = librosa.feature.chroma_cqt(
        y=y_harmonic, sr=sr, hop_length=HOP_LENGTH, bins_per_octave=36, tuning=tuning
    )
    # Non-local means: replace each frame with a median over its nearest
    # neighbours elsewhere in the song, which suppresses melody notes that
    # aren't part of the underlying harmony.
    if chroma.shape[1] > 10:
        chroma = np.minimum(
            chroma,
            librosa.decompose.nn_filter(chroma, aggregate=np.median, metric="cosine"),
        )
    return chroma


def _segment_chroma(
    chroma: np.ndarray, y: np.ndarray, sr: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """Aggregate chroma into beat-length columns. Falls back to fixed windows."""
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP_LENGTH, trim=False)
    tempo = float(np.atleast_1d(tempo)[0])

    if len(beats) < 4:
        step = max(1, int(round(FALLBACK_WINDOW * sr / HOP_LENGTH)))
        bounds = np.arange(0, chroma.shape[1], step)
    else:
        bounds = beats

    bounds = librosa.util.fix_frames(bounds, x_min=0, x_max=chroma.shape[1])
    synced = librosa.util.sync(chroma, bounds, aggregate=np.median, pad=False)
    times = librosa.frames_to_time(bounds[:-1], sr=sr, hop_length=HOP_LENGTH)

    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
    rms = librosa.util.fix_length(rms, size=chroma.shape[1])
    energy = librosa.util.sync(rms[None, :], bounds, aggregate=np.mean, pad=False)[0]

    # sync() emits one column per interval; keep everything in lockstep.
    n = min(synced.shape[1], len(times), len(energy))
    return synced[:, :n], times[:n], energy[:n], tempo


def analyze_file(path: str | Path, progress: Progress = _noop) -> dict:
    progress("Loading audio", 0.05)
    y, sr = librosa.load(str(path), sr=SAMPLE_RATE, mono=True)
    if y.size == 0:
        raise ValueError("Audio file is empty or unreadable")
    duration = float(len(y) / sr)

    progress("Separating harmonics", 0.2)
    # Measured once, on the full mix, and reused everywhere downstream.
    tuning = float(librosa.estimate_tuning(y=y, sr=sr))
    chroma = _chroma(y, sr, tuning)

    progress("Detecting key", 0.55)
    key = detect_key(chroma)
    use_flats = key_prefers_flats(key["tonic"], key["mode"])

    progress("Tracking beats", 0.65)
    synced, times, energy, tempo = _segment_chroma(chroma, y, sr)

    progress("Looking for key changes", 0.72)
    # Songs modulate -- worship songs especially, lifting a semitone for the
    # last chorus. Reporting only the final key hides the first two minutes.
    timeline = [
        {
            **seg,
            "name": f"{note_name(seg['tonic'], key_prefers_flats(seg['tonic'], seg['mode']))} {seg['mode']}",
        }
        for seg in detect_key_timeline(chroma, sr / HOP_LENGTH, duration)
    ]

    progress("Checking this is music", 0.78)
    # Key detection always returns *something*, so ask separately whether the
    # audio behaves like music at all before presenting an answer as fact.
    music = assess(y, sr, synced, key["correlation"])

    progress("Detecting chords", 0.8)
    chords = decode(synced, times, end_time=duration, energy=energy, use_flats=use_flats)

    progress("Finishing up", 0.95)
    return {
        "duration": round(duration, 2),
        "tempo": round(tempo, 1),
        "tuning_cents": round(tuning * 100, 1),
        "music": music,
        "key_timeline": timeline,
        "modulates": len(timeline) > 1,
        "key": {
            "tonic": key["tonic"],
            "mode": key["mode"],
            "name": f"{note_name(key['tonic'], use_flats)} {key['mode']}",
            "confidence": round(key["confidence"], 3),
            "use_flats": use_flats,
            "alternatives": [
                {
                    "name": f"{note_name(a['tonic'], use_flats)} {a['mode']}",
                    "tonic": a["tonic"],
                    "mode": a["mode"],
                    "correlation": round(a["correlation"], 3),
                }
                for a in key["alternatives"]
            ],
        },
        "chords": chords,
    }
