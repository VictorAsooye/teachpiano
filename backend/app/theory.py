"""Music theory primitives: note spelling, chord templates, scales, MIDI voicings.

No audio here -- this is the deterministic layer that turns a chord *label*
("Cmaj7") into actual MIDI notes, and a *key* ("G major") into a scale.
"""

from __future__ import annotations

from typing import Iterable, Sequence

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# (tonic pitch class, mode) pairs conventionally spelled with flats.
FLAT_KEYS = {
    (5, "major"), (10, "major"), (3, "major"), (8, "major"), (1, "major"), (6, "major"),
    (2, "minor"), (7, "minor"), (0, "minor"), (5, "minor"), (10, "minor"), (3, "minor"),
}

# Chord quality -> semitone intervals above the root.
CHORD_QUALITIES: dict[str, tuple[int, ...]] = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
    "sus4": (0, 5, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "min7": (0, 3, 7, 10),
}

# How each quality is written after the root, e.g. "A" + "m7" -> "Am7".
QUALITY_SUFFIX = {
    "maj": "",
    "min": "m",
    "dim": "dim",
    "aug": "aug",
    "sus4": "sus4",
    "7": "7",
    "maj7": "maj7",
    "min7": "m7",
}

NO_CHORD = "N.C."

SCALE_FORMULAS = {
    # Semitone steps from the tonic. Feature #4: pure theory, nothing detected.
    "major": (0, 2, 4, 5, 7, 9, 11),
    "minor": (0, 2, 3, 5, 7, 8, 10),  # natural minor
}


def note_name(pitch_class: int, use_flats: bool = False) -> str:
    names = FLAT_NAMES if use_flats else SHARP_NAMES
    return names[pitch_class % 12]


def key_prefers_flats(tonic_pc: int, mode: str) -> bool:
    return (tonic_pc % 12, mode) in FLAT_KEYS


def chord_label(root_pc: int, quality: str, use_flats: bool = False) -> str:
    return note_name(root_pc, use_flats) + QUALITY_SUFFIX[quality]


def midi_to_name(midi: int, use_flats: bool = False) -> str:
    """MIDI number -> scientific pitch name Tone.js understands, e.g. 60 -> 'C4'."""
    return f"{note_name(midi % 12, use_flats)}{midi // 12 - 1}"


def chord_pitch_classes(root_pc: int, quality: str) -> list[int]:
    return [(root_pc + i) % 12 for i in CHORD_QUALITIES[quality]]


def _stack_from(pcs: Sequence[int], lowest: int) -> list[int]:
    """Stack `pcs` ascending starting on `lowest` (whose pitch class is in pcs)."""
    return [lowest + ((pc - lowest) % 12) for pc in sorted(pcs, key=lambda pc: (pc - lowest) % 12)]


def voice_chord(
    root_pc: int,
    quality: str,
    previous: Sequence[int] | None = None,
    center: int = 62,
    with_bass: bool = True,
) -> list[int]:
    """Pick a playable voicing, choosing the inversion closest to the previous chord.

    Returns MIDI note numbers: a bass note in the C2 octave plus a right-hand
    voicing sitting around middle C, so a progression moves smoothly instead of
    leaping an octave every time the root changes.
    """
    pcs = chord_pitch_classes(root_pc, quality)
    candidates: list[list[int]] = []
    for lowest in range(center - 7, center + 6):
        if lowest % 12 in pcs:
            candidates.append(_stack_from(pcs, lowest))

    def cost(voicing: list[int]) -> float:
        spread = abs(sum(voicing) / len(voicing) - center)
        if not previous:
            return spread
        upper = [n for n in previous if n >= center - 12]
        if not upper:
            return spread
        motion = sum(min(abs(n - p) for p in upper) for n in voicing) / len(voicing)
        return motion + 0.25 * spread

    best = min(candidates, key=cost)
    if with_bass:
        return [36 + root_pc] + best
    return best


def voice_progression(chords: Iterable[tuple[int, str]]) -> list[list[int]]:
    """Voice a whole progression so each chord leads smoothly into the next."""
    out: list[list[int]] = []
    previous: list[int] | None = None
    for root_pc, quality in chords:
        notes = voice_chord(root_pc, quality, previous)
        out.append(notes)
        previous = notes
    return out


def scale_notes(tonic_pc: int, mode: str, octave: int = 4) -> list[int]:
    """One octave of the scale, ascending, as MIDI numbers (tonic repeated on top)."""
    root = 12 * (octave + 1) + (tonic_pc % 12)
    steps = SCALE_FORMULAS[mode]
    return [root + s for s in steps] + [root + 12]


def scale_up_and_down(tonic_pc: int, mode: str, octave: int = 4) -> list[int]:
    up = scale_notes(tonic_pc, mode, octave)
    return up + up[-2::-1]
