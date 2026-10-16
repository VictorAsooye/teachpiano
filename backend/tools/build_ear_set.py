"""
Build the ear trainer's clip list, with every key measured rather than recalled.

The ear trainer asks a learner what key a singer is in, so a wrong answer in
the data teaches a wrong answer. Nothing here is typed in by hand: each song is
found on YouTube, downloaded, run through the same pipeline the app uses, and
kept only if the analysis is confident and the chosen window sits inside one
stable key.

The audio is downloaded here and thrown away. The published site never touches
it -- it plays the clip through YouTube's own embedded player, which is the
sanctioned way to use someone else's recording. What ships is metadata: a video
id, a time window, and a verified key.

Run from the repo root:

    backend\\.venv\\Scripts\\python.exe backend\\tools\\build_ear_set.py

Add songs by editing WANTED below, or pass --query to add one:

    ... build_ear_set.py --query "Goodness of God Bethel Music" --level medium
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import yt_dlp  # noqa: E402

from app.analysis.pipeline import analyze_file  # noqa: E402
from app.youtube import download_audio, ffmpeg_exe  # noqa: E402

OUT = ROOT / "frontend" / "src" / "data" / "earClips.json"
CACHE = ROOT / "backend" / "data" / "earcache"

# Church-first, because that is who this is for: songs a teenager on the
# worship team has actually heard, with a voice carrying the tune rather than a
# wall of production. `level` sets how much help the trainer gives.
WANTED = [
    # (video id, level). Pinned rather than searched: the same query returned
    # a different "official" upload between runs, which silently changed the
    # answers. This list is exactly what ships in earClips.json.
    #
    # To add a song, resolve it by search first:
    #   build_ear_set.py --query "Song Name Artist" --level medium
    # then paste the id it prints in here so the set stays reproducible.
    ("KBD18rsVJHk", "easy"),      # Chris Tomlin - How Great Is Our God (Lyrics And Chor
    ("izrk-erhDdk", "easy"),      # Cornerstone - Live | Hillsong Worship
    ("n0FBb6hnwTo", "easy"),      # Goodness Of God (LIVE) - Jenn Johnson | VICTORY
    ("XtwIT8JjddM", "easy"),      # Matt Redman - 10,000 Reasons (Bless the Lord)
    ("XFRjr_x-yxU", "easy"),      # Phil Wickham - This Is Amazing Grace (Official Music
    ("nQWFzMvCfLE", "easy"),      # What A Beautiful Name - Hillsong Worship
    ("r7V2Ja7LzWg", "medium"),    # All Sons & Daughters - Great Are You Lord (Live)
    ("Y-4NFvI5U9w", "medium"),    # Chris Tomlin - Amazing Grace (My Chains Are Gone)
    ("UH7asSGxAxA", "medium"),    # Chris Tomlin - O Come, O Come Emmanuel (Lyric Video)
    ("P32Vj-R8fkY", "medium"),    # Go down moses - Gospel Feel feat. Samantha Lavital
    ("tTpTQ4kBLxA", "medium"),    # Matt Redman - Blessed Be Your Name (Lyrics And Chord
    ("OP-00EwLdiU", "medium"),    # Oceans (Where Feet May Fail) - Hillsong UNITED - Liv
    ("u-1fwZtKJSM", "medium"),    # Phil Wickham - Living Hope (Official Music Video)
    ("Sc6SSHuZvQE", "medium"),    # Reckless Love (Official Lyric Video)
    ("ErwiBz1QA4o", "hard"),      # Great Is Thy Faithfulness | Maranatha! Music (Lyric 
    ("dQl4izxPeNU", "hard"),      # King of Kings (Live) - Hillsong Worship
    ("Viiw6tGimHo", "hard"),      # Million Little Miracles | Elevation Worship & Maveri
    ("XfuVF8bxAag", "hard"),      # Pastor T.L. Barrett & the Youth For Christ Choir - N
    ("DzHx9OnhEdM", "hard"),      # RATTLE! | Live From Praise Party 2020 | Elevation Wo
    ("7UuM3X4VToI", "hard"),      # Same God (Live From The Loft) | feat. Jonsal Barrien
]


# A clip has to be long enough to find the key in and short enough that nobody
# loses interest waiting for the question.
CLIP_SECONDS = 20.0
MIN_MUSIC = 0.45
MAX_MINUTES = 12

# Two separate bars. The whole song only has to be confident enough to trust
# its key timeline for choosing a window; the clip itself has to be confident
# enough to mark a child's answer wrong, which is a much higher bar.
# detect_key's confidence is 0.5*correlation + 2*margin-over-the-runner-up.
# The runner-up for a major key is nearly always its relative minor, which
# shares all seven notes, so the margin term stays small however obvious the
# key is. A bar much above 0.7 therefore rejects correct answers rather than
# wrong ones. The real safeguard is the agreement check below: the clip and
# the surrounding song are measured separately and have to reach the same key.
MIN_SONG_CONFIDENCE = 0.78
MIN_CLIP_CONFIDENCE = 0.75


def search(query: str) -> dict | None:
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "extract_flat": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        found = ydl.extract_info(f"ytsearch3:{query}", download=False)
    for entry in found.get("entries") or []:
        duration = entry.get("duration") or 0
        if 90 <= duration <= MAX_MINUTES * 60:
            return entry
    return None


def candidate_windows(result: dict) -> list[float]:
    """
    Several places to take the clip from, best-first.

    One fixed window bets the whole song on an arbitrary twenty seconds, and
    some stretches are far clearer than others -- a full chorus states the key
    plainly where a sparse verse barely implies it. Offering the analyser a
    choice turns "this song is unusable" into "this song, but from the chorus".

    All candidates sit inside the longest single-key stretch, so a song that
    lifts a semitone for the last chorus still cannot produce a clip with two
    correct answers.
    """
    duration = result["duration"]
    timeline = result.get("key_timeline") or []
    segments = (
        [(seg["start"], seg["end"]) for seg in timeline] if timeline else [(0.0, duration)]
    )
    start, end = max(segments, key=lambda s: s[1] - s[0])
    usable = end - start - CLIP_SECONDS - 2
    if usable < 4:
        return []
    return [round(start + 2 + usable * f, 1) for f in (0.33, 0.55, 0.15, 0.75)]


def key_of(result: dict, start: float, length: float) -> dict | None:
    """The key of the stretch the clip is taken from, not of the whole song."""
    timeline = result.get("key_timeline") or []
    for seg in timeline:
        if seg["start"] <= start and seg["end"] >= start + length:
            return {"tonic": seg["tonic"], "mode": seg["mode"], "name": seg["name"]}
    key = result["key"]
    if result.get("modulates"):
        return None  # modulates, and the clip is not safely inside one segment
    return {"tonic": key["tonic"], "mode": key["mode"], "name": key["name"]}


def slice_wav(source: Path, dest: Path, start: float, length: float) -> Path:
    """Cut the exact stretch the learner will hear."""
    cmd = [
        ffmpeg_exe(), "-y", "-loglevel", "error",
        "-ss", f"{start:.2f}", "-t", f"{length:.2f}",
        "-i", str(source), "-vn", "-ac", "1", "-ar", "22050", str(dest),
    ]
    import subprocess

    run = subprocess.run(cmd, capture_output=True, text=True)
    if run.returncode != 0 or not dest.exists():
        raise RuntimeError(f"could not cut the clip: {run.stderr.strip()[:120]}")
    return dest


def fetch(video_id: str) -> Path:
    """The song's audio, downloaded once and kept for the next run."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{video_id}.wav"
    if cached.exists():
        return cached
    work = Path(tempfile.mkdtemp(prefix="earset-"))
    try:
        wav, _info = download_audio(f"https://www.youtube.com/watch?v={video_id}", work)
        shutil.copy2(wav, cached)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return cached


def build_one(ref: str, level: str) -> dict | None:
    """`ref` is a video id, or a search query when adding something new."""
    if len(ref) == 11 and " " not in ref:
        entry = {"id": ref, "title": "", "channel": ""}
    else:
        found = search(ref)
        if not found:
            print(f"  no usable result for {ref!r}")
            return None
        entry = found

    print(f"  {entry['id']}  {entry.get('title', '')[:60]}")

    work = Path(tempfile.mkdtemp(prefix="earset-"))
    try:
        wav = fetch(entry["id"])
        if not entry.get("title"):
            from app.youtube import probe

            meta = probe(f"https://www.youtube.com/watch?v={entry['id']}")
            entry["title"] = meta["title"]
            entry["channel"] = meta.get("uploader") or ""
            print(f"    {entry['title'][:60]}")
        result = analyze_file(wav)

        music = result.get("music", {}).get("score", 0)
        if music < MIN_MUSIC:
            print(f"    skipped: does not look like music ({music:.2f})")
            return None
        if result["key"]["confidence"] < MIN_SONG_CONFIDENCE:
            print(f"    skipped: song key confidence {result['key']['confidence']:.2f}")
            return None

        starts = candidate_windows(result)
        if not starts:
            print("    skipped: no stable window long enough")
            return None

        # The published answer is measured on exactly the audio the learner
        # hears, not on the whole song. A worship song that lifts a semitone
        # for the last chorus has two correct answers depending on where you
        # listen, and the clip is the only one that can mark a guess.
        length = CLIP_SECONDS
        best = None
        for start in starts:
            try:
                trial = analyze_file(slice_wav(wav, work / "slice.wav", start, length))
            except Exception:  # noqa: BLE001 - try the next window
                continue
            if best is None or trial["key"]["confidence"] > best[1]["key"]["confidence"]:
                best = (start, trial)
            if trial["key"]["confidence"] >= 0.9:
                break  # already unambiguous; no need to try the rest
        if best is None:
            print("    skipped: could not analyse any window")
            return None
        start, clip_result = best
    except Exception as err:  # noqa: BLE001 - one bad song must not stop the run
        print(f"    skipped: {err}")
        return None
    finally:
        shutil.rmtree(work, ignore_errors=True)

    clip_key = clip_result["key"]
    if clip_key["confidence"] < MIN_CLIP_CONFIDENCE:
        print(f"    skipped: clip key confidence {clip_key['confidence']:.2f}")
        return None

    # Cross-check against the surrounding song. Agreement between two separate
    # measurements is what makes this safe to teach from; disagreement means
    # one of them is wrong and there is no way to tell which.
    segment = key_of(result, start, length)
    if not segment:
        print("    skipped: clip is not safely inside one key")
        return None
    if (segment["tonic"], segment["mode"]) != (clip_key["tonic"], clip_key["mode"]):
        print(
            f"    skipped: song says {segment['name']}, clip says {clip_key['name']}"
        )
        return None

    print(
        f"    {clip_key['name']}  clip conf {clip_key['confidence']:.2f}"
        f"  song conf {result['key']['confidence']:.2f}  at {start:.0f}s +{length:.0f}s"
    )
    return {
        "id": entry["id"],
        "title": entry["title"],
        "artist": entry.get("channel") or entry.get("uploader") or "",
        "start": start,
        "length": length,
        "tonic": clip_key["tonic"],
        "mode": clip_key["mode"],
        "key": clip_key["name"],
        "level": level,
        "confidence": round(clip_key["confidence"], 3),
        "songConfidence": round(result["key"]["confidence"], 3),
        "modulates": bool(result.get("modulates")),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", help="add a single song instead of rebuilding")
    parser.add_argument("--level", default="medium", choices=["easy", "medium", "hard"])
    args = parser.parse_args()

    existing = json.loads(OUT.read_text("utf-8")) if OUT.exists() else []

    if args.query:
        wanted = [(args.query, args.level)]
    else:
        wanted = WANTED
        existing = []

    clips = {clip["id"]: clip for clip in existing}
    for query, level in wanted:
        print(f"\n{query}")
        clip = build_one(query, level)
        if clip:
            clips[clip["id"]] = clip

    out = sorted(clips.values(), key=lambda c: (["easy", "medium", "hard"].index(c["level"]), c["title"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2) + "\n", "utf-8")
    print(f"\n{len(out)} clips -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
