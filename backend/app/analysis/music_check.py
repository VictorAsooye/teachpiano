"""Is this actually music?

Nothing here stops the analysis running. Key detection will happily return a
best-fit key for a podcast, a lecture, or tape hiss, because correlating a
chroma profile against 24 templates always produces a winner. The point of this
module is so the app can say "this doesn't sound like music" instead of
reporting G minor at 136 BPM for a TED talk.

No single measurement separates the two. Solo piano played rubato has almost no
pulse; a trap beat built on one chord has a weak key correlation. What speech
does is score mediocre on *everything*, while music is strong on at least two of
the three. So the three are scaled and averaged.
"""

from __future__ import annotations

import librosa
import numpy as np

# Calibrated on a small hand-checked set: four music tracks (rubato solo piano,
# 80s pop, sparse trap, solo acoustic guitar) scoring 0.49-0.97, and four speech
# videos (TED talk, news report, comedy podcast, product review) scoring
# 0.11-0.33. The threshold sits in the gap between those two groups.
#
# It is a heuristic on eight samples, not a trained classifier, so it only ever
# raises a warning -- the analysis is still shown if you want it.
MUSIC_THRESHOLD = 0.40

# Each feature is mapped onto 0..1 by (value - floor) / span.
KEY_FLOOR, KEY_SPAN = 0.35, 0.50
STABILITY_FLOOR, STABILITY_SPAN = 0.65, 0.22
PULSE_FLOOR, PULSE_SPAN = 0.45, 0.40


def _unit(value: float, floor: float, span: float) -> float:
    return float(np.clip((value - floor) / span, 0.0, 1.0))


def chroma_stability(synced_chroma: np.ndarray) -> float:
    """How much the harmony holds still between beats.

    Music sustains a chord across a bar; speech changes vowel every syllable.
    """
    if synced_chroma.shape[1] < 2:
        return 0.0
    norms = np.maximum(np.linalg.norm(synced_chroma, axis=0, keepdims=True), 1e-9)
    unit = synced_chroma / norms
    return float(np.mean(np.sum(unit[:, :-1] * unit[:, 1:], axis=0)))


def pulse_clarity(y: np.ndarray, sr: int) -> float:
    """Strength of the strongest periodicity in the onset envelope.

    A steady beat autocorrelates strongly with itself; conversational rhythm
    does not. Lags below 8 frames are skipped so the zero-lag peak and its
    shoulder don't count as a pulse.
    """
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    if onset.size < 32:
        return 0.0
    ac = librosa.autocorrelate(onset, max_size=onset.size // 2)
    ac = ac / max(float(ac[0]), 1e-9)
    window = ac[8 : min(400, ac.size)]
    return float(window.max()) if window.size else 0.0


def assess(
    y: np.ndarray,
    sr: int,
    synced_chroma: np.ndarray,
    key_correlation: float,
) -> dict:
    """Score 0..1 for how much this behaves like music, plus the parts."""
    stability = chroma_stability(synced_chroma)
    pulse = pulse_clarity(y, sr)

    parts = {
        "key_strength": _unit(key_correlation, KEY_FLOOR, KEY_SPAN),
        "harmonic_stability": _unit(stability, STABILITY_FLOOR, STABILITY_SPAN),
        "pulse_clarity": _unit(pulse, PULSE_FLOOR, PULSE_SPAN),
    }
    score = float(np.mean(list(parts.values())))

    return {
        "score": round(score, 3),
        "is_music": score >= MUSIC_THRESHOLD,
        "raw": {
            "key_correlation": round(float(key_correlation), 3),
            "chroma_stability": round(stability, 3),
            "pulse_clarity": round(pulse, 3),
        },
        "parts": {k: round(v, 3) for k, v in parts.items()},
    }
