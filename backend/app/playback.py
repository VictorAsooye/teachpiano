"""Turn a stored analysis into something Tone.js can play directly.

The frontend shouldn't have to know any music theory: we hand it note names
("Ab3", "C4", ...) with start times and durations already worked out.
"""

from __future__ import annotations

from theory import (
    NO_CHORD,
    chord_pitch_classes,
    midi_to_name,
    scale_notes,
    scale_up_and_down,
    voice_chord,
)


def build_playback(song: dict) -> dict:
    """Attach MIDI voicings to each chord and work out the key's scale."""
    use_flats = bool(song["key"].get("use_flats"))

    chords: list[dict] = []
    previous: list[int] | None = None
    for chord in song["chords"]:
        if chord.get("root") is None:
            chords.append({**chord, "midi": [], "notes": [], "pitch_classes": []})
            continue
        voicing = voice_chord(chord["root"], chord["quality"], previous)
        previous = voicing
        chords.append(
            {
                **chord,
                "midi": voicing,
                "notes": [midi_to_name(n, use_flats) for n in voicing],
                "pitch_classes": chord_pitch_classes(chord["root"], chord["quality"]),
            }
        )

    tonic, mode = song["key"]["tonic"], song["key"]["mode"]
    one_octave = scale_notes(tonic, mode)
    both_ways = scale_up_and_down(tonic, mode)

    return {
        "chords": chords,
        "scale": {
            "midi": both_ways,
            "notes": [midi_to_name(n, use_flats) for n in both_ways],
            "degrees": [midi_to_name(n, use_flats) for n in one_octave],
            "pitch_classes": sorted({n % 12 for n in one_octave}),
        },
    }


def unique_chords(song: dict) -> list[str]:
    """The distinct chords in the song, in order of first appearance."""
    seen: list[str] = []
    for chord in song["chords"]:
        label = chord["label"]
        if label != NO_CHORD and label not in seen:
            seen.append(label)
    return seen
