"""Key detection via the Krumhansl-Schmuckler algorithm.

Average the song's chroma into a single 12-bin profile, then correlate it
against the 24 major/minor key profiles and take the best match.
"""

from __future__ import annotations

import numpy as np

# Krumhansl & Kessler (1982) key profiles.
MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def _correlate(profile: np.ndarray, chroma: np.ndarray) -> float:
    a = profile - profile.mean()
    b = chroma - chroma.mean()
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


def score_all_keys(chroma_mean: np.ndarray) -> list[tuple[int, str, float]]:
    """Score all 24 keys. Returns (tonic pitch class, mode, correlation) sorted best-first."""
    chroma_mean = np.asarray(chroma_mean, dtype=float)
    if chroma_mean.sum() > 0:
        chroma_mean = chroma_mean / chroma_mean.sum()

    scores: list[tuple[int, str, float]] = []
    for tonic in range(12):
        rotated = np.roll(chroma_mean, -tonic)
        scores.append((tonic, "major", _correlate(MAJOR_PROFILE, rotated)))
        scores.append((tonic, "minor", _correlate(MINOR_PROFILE, rotated)))
    scores.sort(key=lambda s: s[2], reverse=True)
    return scores


def detect_key(chroma: np.ndarray) -> dict:
    """`chroma` is a (12, n_frames) matrix. Returns the winning key plus runners-up."""
    chroma_mean = np.asarray(chroma, dtype=float).mean(axis=1)
    scores = score_all_keys(chroma_mean)
    tonic, mode, corr = scores[0]

    # Confidence: how far clear of the runner-up, squashed into 0..1.
    runner_up = scores[1][2]
    margin = max(0.0, corr - runner_up)
    confidence = float(np.clip(0.5 * max(corr, 0.0) + 2.0 * margin, 0.0, 1.0))

    return {
        "tonic": tonic,
        "mode": mode,
        "correlation": corr,
        "confidence": confidence,
        "alternatives": [
            {"tonic": t, "mode": m, "correlation": c} for t, m, c in scores[1:4]
        ],
    }


# A key needs this long to be worth reporting as a section of the song. Shorter
# than this and it is a passing tonicisation -- a few borrowed chords on the way
# somewhere -- not a key change a player would act on.
MIN_SEGMENT_SECONDS = 15.0

WINDOW_SECONDS = 20.0
HOP_SECONDS = 2.5


def _viterbi_keys(scores: np.ndarray, self_prob: float = 0.985) -> np.ndarray:
    """Smooth a sequence of per-window key scores into a stable path.

    Without this the answer flickers between a key and its relative every time
    a chorus leans on the vi chord.
    """
    n_states, n_steps = scores.shape
    # Scores are correlations in -1..1; shift into a positive range before
    # taking logs so they behave like likelihoods.
    likelihood = np.log(np.clip((scores + 1.0) / 2.0, 1e-6, None))
    trans = np.full((n_states, n_states), np.log((1.0 - self_prob) / (n_states - 1)))
    np.fill_diagonal(trans, np.log(self_prob))

    delta = likelihood[:, 0]
    back = np.zeros((n_states, n_steps), dtype=int)
    for t in range(1, n_steps):
        totals = delta[:, None] + trans
        back[:, t] = np.argmax(totals, axis=0)
        delta = totals[back[:, t], np.arange(n_states)] + likelihood[:, t]

    path = np.zeros(n_steps, dtype=int)
    path[-1] = int(np.argmax(delta))
    for t in range(n_steps - 1, 0, -1):
        path[t - 1] = back[path[t], t]
    return path


def detect_key_timeline(chroma: np.ndarray, frames_per_second: float, duration: float) -> list[dict]:
    """Find where the key changes, if it does.

    A single key for a whole song is the common case and the one most tools
    report. But songs modulate -- worship songs especially, lifting a semitone
    for the last chorus -- and "the key is B" is unhelpful if the first two
    minutes are in A.
    """
    window = max(1, int(WINDOW_SECONDS * frames_per_second))
    hop = max(1, int(HOP_SECONDS * frames_per_second))
    n_frames = chroma.shape[1]
    if n_frames < window:
        return []

    starts = list(range(0, max(1, n_frames - window + 1), hop))
    scores = np.zeros((24, len(starts)))
    for i, start in enumerate(starts):
        mean = chroma[:, start : start + window].mean(axis=1)
        for tonic, mode, corr in score_all_keys(mean):
            scores[tonic * 2 + (0 if mode == "major" else 1), i] = corr

    path = _viterbi_keys(scores)

    # Each window is labelled at its centre, so that is where its time sits.
    centres = [(s + window / 2) / frames_per_second for s in starts]
    segments: list[dict] = []
    for state, centre in zip(path, centres):
        tonic, mode = divmod(int(state), 2)
        mode_name = "major" if mode == 0 else "minor"
        if segments and segments[-1]["tonic"] == tonic and segments[-1]["mode"] == mode_name:
            segments[-1]["end"] = centre
        else:
            segments.append({"tonic": tonic, "mode": mode_name, "start": centre, "end": centre})

    if not segments:
        return []

    # Stretch the ends out to cover the whole song.
    segments[0]["start"] = 0.0
    segments[-1]["end"] = duration
    for i in range(len(segments) - 1):
        boundary = (segments[i]["end"] + segments[i + 1]["start"]) / 2
        segments[i]["end"] = boundary
        segments[i + 1]["start"] = boundary

    # Drop anything too short to be a real section, folding it into its
    # neighbour so the timeline stays continuous.
    merged: list[dict] = []
    for seg in segments:
        if merged and seg["end"] - seg["start"] < MIN_SEGMENT_SECONDS:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg)
    while len(merged) > 1 and merged[0]["end"] - merged[0]["start"] < MIN_SEGMENT_SECONDS:
        merged[1]["start"] = merged[0]["start"]
        merged.pop(0)

    # Neighbours can match again once the short ones are gone.
    final: list[dict] = []
    for seg in merged:
        if final and final[-1]["tonic"] == seg["tonic"] and final[-1]["mode"] == seg["mode"]:
            final[-1]["end"] = seg["end"]
        else:
            final.append(seg)

    return [
        {
            "tonic": s["tonic"],
            "mode": s["mode"],
            "start": round(s["start"], 1),
            "end": round(s["end"], 1),
        }
        for s in final
    ]
