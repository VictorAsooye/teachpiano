# Song Decoder

Learn the piano from scratch, train your ear, and work out the key of anything — a song
on YouTube, or someone singing live in front of you.

It started as a tool for one practising pianist and grew into five:

| Tab | What it is for |
| --- | --- |
| **Learn the piano** | Ten levels, beginner to playing in any key |
| **Decode a song** | Paste a YouTube link, get the key and the chords |
| **Learn keys** | Work through all 24 keys; play each one and get checked |
| **Train your ear** | Hear a cadence, find the home note |
| **Live key finder** | Point the mic at a singer, read the key off the screen |
| **Style coach** | Play a progression; it tells you what would sound better |

---

## What it does

| Feature | Where it lives |
| --- | --- |
| Pull audio from a YouTube link | `backend/app/youtube.py` (yt-dlp + bundled ffmpeg) |
| Detect the key (Krumhansl-Schmuckler) | `backend/app/analysis/key_detect.py` |
| Detect the chord progression | `backend/app/analysis/chords.py` |
| Turn chords into MIDI notes | `backend/app/theory.py`, `backend/app/playback.py` |
| Play progression + scale on a piano | `frontend/src/player.js` (Tone.js) |
| Save every analysed song | `backend/app/db.py` (SQLite) |
| Guess-first ear training | `frontend/src/guess.js`, `components/GuessPanel.jsx` |
| Play your guess on a real piano | `frontend/src/midi.js` (Web MIDI) |
| Spotting audio that isn't music | `backend/app/analysis/music_check.py` |
| Categories and the random picker | `frontend/src/library.js` |
| The 24 keys, spelled properly | `frontend/src/keys.js` |
| Ten-level curriculum | `frontend/src/lessons.js` |
| Live key detection from the mic | `frontend/src/liveKey.js` |
| Judging how musically something was played | `frontend/src/style.js` |
| Letters, numbers or solfège | `frontend/src/notation.js` |
| Finding where a song changes key | `backend/app/analysis/key_detect.py` |

---

## Running it

Double-click **`Song Decoder.bat`** in this folder. It starts the server and opens
the app in your browser at <http://127.0.0.1:8420>.

A minimised window titled *"Song Decoder server"* stays open while the app runs —
**close that window to quit.** Running the launcher again when it is already
running just reopens the browser tab.

Want it on your desktop or taskbar? Right-click `Song Decoder.bat` →
**Show more options** → **Send to** → **Desktop (create shortcut)**.

### First-time setup

Only needed once. The launcher tells you if either step is missing.

```bash
py -3.11 -m venv backend\.venv && backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

```bash
cd frontend && npm install && npm run build
```

No system-wide `ffmpeg` install is needed: `imageio-ffmpeg` ships a binary and the
downloader calls it directly.

### Working on the code

The launcher serves the pre-built UI, so a change to anything under `frontend/src`
won't show up until you re-run `npm run build`. For live reload, run the two
servers separately instead:

```bash
cd backend && .venv\Scripts\python.exe run.py
```

```bash
cd frontend && npm run dev
```

That gives you the app on <http://localhost:5173> with hot reload, proxying API
calls to the backend on 8420.

### If the page says it can't reach the server

The server and the page are the same process: `Song Decoder.bat` starts it, and
closing the *"Song Decoder server"* window stops it. If that window is gone,
nothing works — the page may still be sitting in the browser from before, but
every action fails.

Run the launcher again. Two things to check:

- You are on **http://127.0.0.1:8420**, not `localhost:5173`. Port 5173 is the
  development server and is only running if you started it yourself.
- The *"Song Decoder server"* window is open.

The page reports this case in as many words rather than showing the browser's
bare "Failed to fetch", which reads like a bug in the app when it isn't.

> **Ports:** the backend uses **8420**, not 8000 — something else on this machine
> already holds 8000. To move it, change `backend/run.py` and the proxy in
> `frontend/vite.config.js`.

---

## Learning to play

**Learn the piano** is ten levels in three stages — *Starting out*, *Playing chords*,
*Any key by ear*. Nothing is locked and nothing is saved: open any level, read it,
then hit the button at the bottom, which drops you into the tool that makes it real.
Reading about a key teaches nothing until you play one.

The slant is deliberately church-band. The number system ("go to the 4") and the
1-5-6-4 progression arrive at levels 3 and 6, because they are what actually gets used
on a Sunday and they are the fastest route to being useful in a room.

**Learn keys** walks the 24 keys easiest-first — C, G, F, D, Bb, A, Eb, E, Ab, B, Db,
F# — fewest accidentals first, sharps before flats on a tie. Each key shows its
signature, its notes, and the keyboard. With a MIDI piano connected it checks you
playing the scale note by note, matching on pitch class so starting an octave low is
not an error.

Keys are spelled the way sheet music spells them: F# major is `F# G# A# B C# D# E#`,
Eb minor is `Eb F Gb Ab Bb Cb Db`. Each scale uses every letter exactly once, which is
what makes it readable — and all 24 are checked against that rule in tests.

**Train your ear** plays a I-IV-V-I cadence in a random key and asks which note is
home. Start on Easy (three keys) rather than all twelve, because twelve options on day
one is a coin flip with extra steps.

Naming a key from nothing is absolute pitch, which adults mostly cannot learn. Hearing
where music wants to come to rest is relative pitch, which is learnable and is what you
actually do when working out a singer's key — so the cadence comes first, to give your
ear a home to find. Playing a note on the piano deliberately does **not** submit it:
you hunt around until something sounds right, then lock it in.

---

## Live key finder

Point the microphone at whoever is singing. The key fills the screen, with major or
minor under it.

Mic → Web Audio FFT → chroma → the same Krumhansl-Schmuckler correlation the offline
analysis uses, running continuously. Some details that matter:

- **Echo cancellation, noise suppression and auto gain are all switched off.** They are
  built for speech and actively damage a musical signal — they change the very balance
  between notes we are measuring.
- **It will not answer instantly, on purpose.** One frame of a solo voice is one note,
  and one note belongs to many keys. Evidence accumulates over a rolling window and a
  reading only reaches the big display once it has held steady, or the number flickers
  between relative keys on every passing note.
- **The loop runs on a timer, not `requestAnimationFrame`.** rAF only fires while the
  page is painting, so switching tabs would silently stop the analysis — the one thing
  a tool you glance at mid-song must not do.
- Hit **Start over** when the song changes, or it keeps weighing the last one.

### The room is the hard part, not the singing

The first version worked on clean test signals and failed on an actual person
singing into a laptop. The cause was the room, not the voice.

Chroma is built by taking the peak in each note's frequency band. A room puts
energy in *every* band, so that noise lands in all twelve pitch classes equally
and flattens the chroma until no key correlates with anything. Measured on a
sung melody, with the noise floor left in:

| Room noise | Result |
| --- | --- |
| Quiet room | right key, margin 0.121 |
| Normal room | right key, **margin 0.025 — below the commit threshold, so it never answers** |
| Laptop mic | **wrong key**, confidently |

The fix is to subtract a noise floor before folding into pitch classes, using
the median note as the estimate — in real music most of the 49 notes in range
are not sounding at any moment, so the median *is* the noise. With that in,
every noise level from studio to across-the-room reads correctly with a margin
of 0.12 or better.

Two supporting changes: the input threshold now sits low enough for a quiet
laptop mic, and after about eight seconds the display shows its **best guess**
rather than sitting on "still deciding" indefinitely. A hedged answer is useful;
an empty screen after singing a whole song is not.


### When a song really does change key

Reporting one key for a song that modulates hides most of the story. A worship
song that starts in A, lifts to Bb and ends in B is "in B" by the usual
definition, and that is useless if you are playing the first two minutes.

So the offline analysis also reports a **key timeline**: 20-second windows
scored against all 24 keys, smoothed with Viterbi so the answer does not flicker
between a key and its relative every time a chorus leans on the vi, then merged
into sections. Anything under 15 seconds is folded into its neighbour — that is
a passing tonicisation, not a key change a player would act on.

Measured on a song built to match exactly that shape:

| Built as | Detected |
| --- | --- |
| A major, 0–48s | A major, 0.0–48.5s |
| Bb major, 48–90s | Bb major, 48.5–88.3s |
| B major, 90–144s | B major, 88.3–144.0s |

Boundaries land within about two seconds. Just as important, it does **not**
invent key changes: Canon in D, Never Gonna Give You Up and the trap beat all
come back as a single section.

The headline key stays the one the song spends most of its time in, so it still
agrees with what other tools report — the sections are shown underneath it, and
tapping one jumps the video there.

### Chords are not key changes

The most common misreading of this tool is to expect the big letter to follow
whatever chord is sounding. It does not, and it must not.

A song in C major spends most of its time *not* on the C chord — it sits on F,
G and Am. Those are chords **within** the key, not key changes, and the pool of
notes never leaves C major. So the detector ignores "what is sounding now"
entirely and asks instead: across the last fifteen seconds or so, which key's
seven notes explain everything I have heard?

Measured behaviour, from the test harness:

| Played | Reads |
| --- | --- |
| C - F - G - Am - Dm - G - C | C major throughout |
| Same, with a borrowed D7 (an F# foreign to C major) | C major throughout |
| A - Dm - Em - Am - F - G | A minor throughout |
| Four bars of C, then the song moves up to D | C major, then D major after ~5 chords |

That last row is the point: a **real** key change is followed, deliberately
slowly. A single foreign chord is not. The threshold between those two was
measured rather than guessed — below a 0.08 margin a borrowed chord steals the
key, at 0.08 and above it holds, and a genuine modulation is still followed.
The shipped value is 0.12.

Worth separating two different things people call "a different key":

- **A singer transposing.** They sing a song lower than the record. The song is
  still in one key — just a different one. The detector tells you the key *they*
  are in, which is exactly what you want.
- **A song modulating.** The song genuinely changes key partway through. The
  detector follows, after a few seconds.

Verified end to end by feeding synthetic progressions through a real `MediaStream`:
G major and Eb major both read correctly, and the DSP is unit-tested against
synthetic spectra including a solo sung melody.

---

## Categories and the random picker

The library groups two ways at once.

**Auto** groups come from what the analysis already knows — Minor/Major, tempo
bands (slow under 90, mid 90–130, fast over 130), and a *Not music* group for
anything the music check flagged. They need no setup and work on a library
nobody has tagged.

**Mine** are your own words. Type one in the field next to a song's title —
`trap`, `gospel`, `classical` — and it becomes a chip. Existing categories are
offered as suggestions so you reuse them instead of inventing `Trap` alongside
`trap`. Enter or clicking away saves it; clearing the field removes the tag.

**🎲 Random** opens a random song from whatever group is selected, or from the
whole library if none is. It never hands you the song already open — in a
two-song group that would come up half the time and feel broken rather than
random.

Two details worth knowing:

- Re-analysing a song leaves its category alone. `save_song` deliberately
  doesn't touch the column, because the tag is yours and the analysis isn't.
- With **Guess first** on, the Minor/Major chips disappear. They would hand back
  the exact answer the mode is hiding, and an active mode filter is cleared when
  you switch the mode on.

---

## Guess-first mode

Flip the **Guess first** toggle and the app stops handing you the answer. It
becomes a two-stage test:

1. **Name the key.** Pick a root and major/minor, hit Check.
2. **Name the chords.** Type them any way you like — `D A Bm F#m`,
   `B minor, G major`, even `F sharp minor`.

Only then does it reveal the progression. The setting sticks between sessions,
and while it is on the library stops printing each song's key next to its title.

It grades rather than just uncovering, and it tries to grade the way a teacher
would:

- **Enharmonics are the same answer.** `F#` and `Gb` both count.
- **Sevenths are not marked wrong.** The detector itself struggles to tell a
  triad from its 7th, so grading you on that would be testing our algorithm's
  quirks rather than your ear. Major vs. minor is the real question.
- **The relative key counts as close.** Answer F minor for an Ab major song and
  you get credit — those two share all seven notes, and it is the single most
  defensible "wrong" answer in music.
- **Chords are weighted by how long they sound.** Name the five chords a song is
  built on and you score 5 of 5, even when the detector also found a one-off
  passing chord in the third verse. Catch one of those rare ones anyway and it
  is called out as a bonus.

One spoiler it cannot help: the video title. Pachelbel's *Canon in D* gives
itself away.

### Finding the key by ear

The song plays in the page — click the poster and a YouTube player loads. The
embed only mounts on click, so nobody pays for YouTube's iframe or its cookies
just to look at a chord chart, and there is a link straight to YouTube for
uploads that refuse to be embedded.

With a piano connected, the key stage shows what you are playing live — single
notes by name, three or more as a chord — so you can hunt for the tonic against
the track. **Sound** routes your keys through the app's own piano, which you
want on a controller with no speakers and off on a digital piano that already
makes its own noise. Nothing you play here is recorded; the key stage is for
hunting, and only the chord stage writes anything into an answer.

### Playing your guess instead of typing it

Hit **Use my piano** in the chord stage and it listens to a MIDI keyboard over
USB. Play a chord, lift your hands, and its name drops into the answer box —
which is the same box you can type into, so the answer stays editable and the
grader only ever reads one thing.

Details that matter on real hardware:

- **Rolling a chord works.** It reports the fullest shape held during a press,
  not a stream of fragments as each finger lands.
- **Two notes never commit.** An interval is ambiguous, and warming up
  shouldn't fill the answer box.
- **Note-on with velocity 0 counts as note-off.** Plenty of keyboards release
  notes that way instead of sending a real note-off.
- **Inversions are named by what they are.** Play E–G–C and it says `C`.

Chrome and Edge only — Web MIDI is not in Safari, and Firefox needs it turned
on. No driver or extra software either way, and `127.0.0.1` already counts as
the secure context the API requires.

#### Latency

Live notes are scheduled with Tone's `immediate()`, not the default `now()`.
Tone's `lookAhead` is 100ms: every event is placed a tenth of a second into the
future so the transport can hit its timing exactly. That is right for playing a
progression back and completely wrong for playing along, where it is simply
100ms of lag between the key going down and the sound arriving.

Progression and scale playback still use the lookahead — they want it.

The piano is also loaded when you connect the device rather than on your first
keypress, so the first note doesn't stall behind 22 sample downloads.

What is left is roughly 10ms of `AudioContext.baseLatency` plus whatever the
Windows audio stack adds, neither of which a web page can do anything about. If
your digital piano makes its own sound, untick **Sound** and play through the
instrument directly — that path has no browser latency at all.

---

## How the analysis works

### Key detection

`librosa` computes a **chroma** — how strongly each of the 12 pitch classes sounds across
the track. Averaging that into one 12-bin profile and correlating it against the 24
Krumhansl-Schmuckler major/minor key profiles gives the key. The runners-up are kept and
shown in the UI, because key detection is genuinely ambiguous for some songs (a major key
and its relative minor share all seven notes).

### Chord detection

Same chroma, but matched in short windows instead of all at once:

1. **Harmonic separation** strips out drums and transients.
2. **Non-local median filtering** suppresses melody notes that aren't part of the harmony.
3. **Beat tracking** slices the song into beat-length windows — chords change on beats, so
   this beats a fixed half-second grid.
4. **Template matching** compares each window against 96 chord templates
   (12 roots × 8 qualities) by cosine similarity.
5. **Viterbi decoding** smooths the frame-by-frame result. Without it the output flickers
   between three plausible chords every beat; with it, chords hold for a bar like real music.

Two details that matter, both learned the hard way:

- **Richer chords are handicapped** (`QUALITY_BIAS`). A `maj7` template contains the whole
  `maj` template, so without a penalty every major chord with a passing 7th in the melody
  comes back as `maj7`.
- **"No chord" is a threshold, not a template.** A flat 12-bin template competing on cosine
  similarity beats every sparse triad, because real chroma is dense — that returns the
  entire song as silence. N.C. is driven by an RMS silence test instead.

### Accuracy

Template matching is not a trained model, and it will make mistakes — mostly chord
*quality* (major vs. major-7th, or a triad vs. its relative minor), rarely the root.
Treat the confidence bar on each row as a real signal.

Measured against known ground truth:

| Song | Key | Progression |
| --- | --- | --- |
| Pachelbel, *Canon in D* | **D major** ✓ | `D A Bm F#m G D G A` — the exact canonical cycle |
| *Never Gonna Give You Up* | **Ab major** ✓ | `Ab Bbm Db Fm Eb` — correct chord vocabulary |
| Trap beat, *"Kidding Me"* | **F minor** ✓ | poor — collapses to one chord, and says so (confidence 0.13) |

### Always pass tuning in explicitly

`chroma_cqt` estimates tuning from whatever signal you hand it. We hand it the
*harmonic* component, which has had content stripped out by HPSS and gives a
worse estimate than the full mix does.

On the trap beat that error was **2 cents** — enough to shift the chroma and
hand the key to Db major over the correct F minor, on a margin of 2%. The fix is
to measure tuning once on the full mix and pass it down. Pinning it to zero is
*not* the fix: *Never Gonna Give You Up* is genuinely 14 cents sharp.

That song is also a good illustration of why key detection is hard. F Phrygian —
the default flavour of trap — contains exactly the same seven notes as Db major.
Note content alone cannot separate them; only the tonal centre does.

### Is it even music?

Key detection always returns *something*. Correlating a chroma profile against
24 templates produces a winner no matter what you feed it, so before this check
existed a TED talk came back as "G minor, 136 BPM" with eleven chords.

`music_check.py` scores three things and averages them:

| Signal | Music | Speech |
| --- | --- | --- |
| Key correlation | strong for tonal music | near zero |
| Harmonic stability beat-to-beat | a chord is held across a bar | changes every syllable |
| Pulse clarity | onsets autocorrelate | conversational rhythm doesn't |

No single one works. Rubato solo piano has almost no pulse; a one-chord trap
beat has a weak key correlation. What separates them is that **speech is
mediocre at all three, while music is strong at two of them**.

Hand-checked on eight videos:

| | score |
| --- | --- |
| Canon in D · Never Gonna Give You Up · trap beat · solo acoustic guitar | 0.49 – 0.97 |
| TED talk · news report · comedy podcast · product review | 0.11 – 0.33 |

The threshold sits at **0.40**, in the gap. This is a heuristic calibrated on
eight samples, not a trained classifier, so it only ever raises a warning — the
analysis is still one click away. The genuinely ambiguous case is talking over
background music (vlogs, tutorials), which sits between the two groups.

### Chords → MIDI

No AI needed for this part. `C major` is pitch classes 0, 4, 7 — the work is picking a
*voicing*. `theory.voice_chord` chooses the inversion closest to the previous chord and
adds a bass note, so a progression moves smoothly instead of leaping an octave every time
the root changes.

The scale player is pure theory: given the key, the seven notes follow from the major or
natural-minor formula. Nothing is detected.

---

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/analyze` | `{url}` → a cached song, or a job to poll |
| `GET /api/jobs/{id}` | Progress (`stage`, `progress`), plus the song when done |
| `GET /api/songs` | Library listing |
| `GET /api/songs/{id}` | One song, including MIDI-ready playback data |
| `DELETE /api/songs/{id}` | Remove from the library |

Analysis is a polled job rather than a blocking request — a 30-second HTTP request is a
fragile thing, and polling gives you a real progress bar for free.

---

## Notes

- **Long videos are trimmed, not refused.** Anything over 12 minutes
  (`MAX_ANALYSIS_SECONDS`) is analysed from the start up to that point, and the
  page says so. ffmpeg does the trimming during conversion, so a 90-minute video
  costs one short conversion and one short analysis rather than being turned
  away. Verified on a 90-minute Canon in D loop: 12 minutes read, key correct.
- Live streams are refused — there is no finished audio to analyse. So is
  anything over 4 hours (`MAX_SOURCE_SECONDS`), since the full audio track is
  still downloaded before it gets trimmed.
- Downloaded audio is written to a temp folder and **deleted** as soon as analysis
  finishes; only the resulting chord/key data is stored.
- Keep this as a personal practice tool. Downloading audio for your own analysis is the
  same use case as Chord AI or Moises; redistributing song audio is not.

---

## Deploying

The site is `VictorAsooye/teachpiano` on GitHub, served at **teachpiano.app**.

Pushing to `main` is the whole deploy: `.github/workflows/deploy.yml` builds
`frontend/` and publishes it to GitHub Pages. `frontend/public/CNAME` carries
the domain into the build, which is what tells Pages the custom domain belongs
to this site.

Only the frontend ships. The backend needs a server, a persistent disk and a
residential IP (YouTube blocks datacenter ranges), so song decoding stays local
behind `Song Decoder.bat`. The app detects the missing server and hides "From a
song" by itself.

### First-time setup

```
git push -u origin main          # approve the GitHub sign-in popup
```

Then in the repo, **Settings → Pages → Source: GitHub Actions**, and set the
custom domain to `teachpiano.app`.

### DNS at Namecheap

Advanced DNS → remove the two parking records, then:

| Type  | Host | Value                   |
| ----- | ---- | ----------------------- |
| A     | @    | 185.199.108.153         |
| A     | @    | 185.199.109.153         |
| A     | @    | 185.199.110.153         |
| A     | @    | 185.199.111.153         |
| CNAME | www  | victorasooye.github.io. |

**`.app` is HSTS-preloaded**, so browsers refuse plain HTTP for it outright.
Between repointing the DNS and GitHub issuing the TLS certificate the domain is
not slow or ugly, it is *unreachable* — no holding page, no error. Usually
fifteen minutes to a few hours. Tick **Enforce HTTPS** in the Pages settings
once the certificate appears.
