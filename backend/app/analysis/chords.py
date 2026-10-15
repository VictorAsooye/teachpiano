"""Chord recognition by chroma template matching + Viterbi smoothing.

For every beat we compare the 12-bin chroma vector against a bank of chord
templates (C major = C+E+G, A minor = A+C+E, ...) and pick the best match.
A hidden-Markov pass over the whole song then cleans up the frame-by-frame
jitter, because real music holds a chord for a bar rather than flickering
between three of them every beat.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from theory import CHORD_QUALITIES, NO_CHORD, chord_label  # noqa: E402

# Which qualities we are willing to report. Adding every extension makes the
# matcher worse, not better -- near-identical templates just steal each other's
# frames. These eight cover the vast majority of pop/rock/jazz-lite piano parts.
QUALITIES = ["maj", "min", "min7", "7", "maj7", "sus4", "dim", "aug"]

# Slight handicap for the richer chords so a plain triad wins ties. A maj7
# template contains the maj template, so without this every major chord with a
# passing 7th in the melody would come back as maj7.
QUALITY_BIAS = {
    "maj": 1.00,
    "min": 1.00,
    "min7": 0.93,
    "7": 0.92,
    "maj7": 0.92,
    "sus4": 0.86,
    "dim": 0.85,
    "aug": 0.82,
}

# Chroma weight per chord tone: root and fifth anchor the chord, the third and
# seventh identify it, so the third is worth emphasising.
TONE_WEIGHTS = {0: 1.0, 3: 1.0, 4: 1.0, 5: 0.9, 6: 0.9, 7: 0.8, 8: 0.8, 10: 0.6, 11: 0.6}


def build_templates() -> tuple[np.ndarray, list[tuple[int, str] | None]]:
    """Return an (n_states, 12) L2-normalised template bank and its state labels."""
    templates: list[np.ndarray] = []
    labels: list[tuple[int, str] | None] = []

    for root in range(12):
        for quality in QUALITIES:
            vec = np.zeros(12)
            for interval in CHORD_QUALITIES[quality]:
                vec[(root + interval) % 12] = TONE_WEIGHTS.get(interval, 0.8)
            templates.append(vec / np.linalg.norm(vec))
            labels.append((root, quality))

    return np.vstack(templates), labels


def _similarity(chroma: np.ndarray, templates: np.ndarray) -> np.ndarray:
    """Cosine similarity of every frame against every template -> (n_states, n_frames)."""
    norms = np.linalg.norm(chroma, axis=0, keepdims=True)
    norms[norms == 0] = 1.0
    unit = chroma / norms
    sim = templates @ unit
    bias = np.array([QUALITY_BIAS[q] for _, q in _LABELS])[:, None]
    return sim * bias


_TEMPLATES, _LABELS = build_templates()
# Decoding adds one extra state on the end for "no chord".
_STATE_LABELS: list[tuple[int, str] | None] = _LABELS + [None]


def _transition_matrix(n_states: int, self_prob: float) -> np.ndarray:
    trans = np.full((n_states, n_states), (1.0 - self_prob) / (n_states - 1))
    np.fill_diagonal(trans, self_prob)
    return trans


def _viterbi(prob: np.ndarray, trans: np.ndarray) -> np.ndarray:
    """Standard log-domain Viterbi decode with a uniform initial distribution."""
    n_states, n_frames = prob.shape
    log_p = np.log(np.maximum(prob, 1e-12))
    log_t = np.log(np.maximum(trans, 1e-12))

    delta = np.log(1.0 / n_states) + log_p[:, 0]
    backpointers = np.zeros((n_states, n_frames), dtype=int)
    for t in range(1, n_frames):
        scores = delta[:, None] + log_t
        backpointers[:, t] = np.argmax(scores, axis=0)
        delta = scores[backpointers[:, t], np.arange(n_states)] + log_p[:, t]

    path = np.zeros(n_frames, dtype=int)
    path[-1] = int(np.argmax(delta))
    for t in range(n_frames - 1, 0, -1):
        path[t - 1] = backpointers[path[t], t]
    return path


def decode(
    chroma: np.ndarray,
    times: np.ndarray,
    end_time: float,
    energy: np.ndarray | None = None,
    self_prob: float = 0.92,
    temperature: float = 0.06,
    min_duration: float = 0.35,
    no_chord_score: float = 0.50,
    silence_db: float = -40.0,
    use_flats: bool = False,
) -> list[dict]:
    """Turn beat-synchronous chroma into a timed chord list.

    `chroma` is (12, n_frames); `times[i]` is the start time of frame i;
    `energy` is an optional per-frame RMS used to spot silence.
    """
    if chroma.shape[1] == 0:
        return []

    chord_sim = _similarity(chroma, _TEMPLATES)

    # "No chord" is a floor, not a template. Competing on cosine similarity
    # doesn't work: real chroma is dense enough that a flat template beats every
    # sparse triad, and the whole song comes back as silence. The floor sits
    # below any realistic music frame, so N.C. is really driven by the silence
    # test below -- in music there is nearly always *some* chord sounding, and a
    # single N.C. state otherwise wins ambiguous passages by default, because
    # the chord states split their probability across near-identical templates.
    floor = np.full((1, chord_sim.shape[1]), no_chord_score)
    if energy is not None and len(energy) == chord_sim.shape[1]:
        peak = float(np.max(energy)) or 1.0
        quiet = 20 * np.log10(np.maximum(energy, 1e-10) / peak) < silence_db
        floor[0, quiet] = 1.0  # actual silence: nothing else can win
    sim = np.vstack([chord_sim, floor])
    # Softmax over states so Viterbi gets a real per-frame distribution.
    exp = np.exp((sim - sim.max(axis=0, keepdims=True)) / temperature)
    prob = exp / exp.sum(axis=0, keepdims=True)

    path = _viterbi(prob, _transition_matrix(sim.shape[0], self_prob))

    # Report the match quality of the chosen chord, not its softmax posterior:
    # with ~100 competing states the posterior is tiny even for a clean match,
    # which reads as "we have no idea" when in fact we do.
    raw = sim[path, np.arange(len(path))]
    confidences = np.clip((raw - 0.55) / 0.30, 0.0, 1.0)

    frames = [
        {
            "state": int(state),
            "start": float(times[i]),
            "end": float(times[i + 1]) if i + 1 < len(times) else float(end_time),
            "confidence": float(conf),
        }
        for i, (state, conf) in enumerate(zip(path, confidences))
    ]
    return _to_segments(frames, min_duration, use_flats)


def _to_segments(frames: list[dict], min_duration: float, use_flats: bool) -> list[dict]:
    """Merge runs of identical states, then absorb slivers into their neighbours."""
    merged: list[dict] = []
    for f in frames:
        if merged and merged[-1]["state"] == f["state"]:
            merged[-1]["end"] = f["end"]
            merged[-1]["confidences"].append(f["confidence"])
        else:
            merged.append({**f, "confidences": [f["confidence"]]})

    # A chord shorter than min_duration is almost always a decoding artefact.
    cleaned: list[dict] = []
    for seg in merged:
        if cleaned and seg["end"] - seg["start"] < min_duration:
            cleaned[-1]["end"] = seg["end"]
        else:
            cleaned.append(seg)
    while len(cleaned) > 1 and cleaned[0]["end"] - cleaned[0]["start"] < min_duration:
        cleaned[1]["start"] = cleaned[0]["start"]
        cleaned.pop(0)

    out: list[dict] = []
    for seg in cleaned:
        label = _STATE_LABELS[seg["state"]]
        if label is None:
            out.append(
                {
                    "label": NO_CHORD,
                    "root": None,
                    "quality": None,
                    "start": round(seg["start"], 3),
                    "end": round(seg["end"], 3),
                    "confidence": round(float(np.mean(seg["confidences"])), 3),
                }
            )
        else:
            root, quality = label
            out.append(
                {
                    "label": chord_label(root, quality, use_flats),
                    "root": root,
                    "quality": quality,
                    "start": round(seg["start"], 3),
                    "end": round(seg["end"], 3),
                    "confidence": round(float(np.mean(seg["confidences"])), 3),
                }
            )
    return out
