/**
 * Live key detection from the microphone.
 *
 * Same idea as the offline analysis — fold the spectrum into twelve pitch
 * classes, correlate against the 24 Krumhansl-Schmuckler profiles — but it has
 * to run continuously and commit to an answer while someone is still singing.
 *
 * The hard part is not the maths, it is the tension between "quick" and
 * "accurate". One frame of a solo voice contains one note, and one note belongs
 * to many keys, so an instant answer is a guess. The tracker therefore builds
 * evidence over a rolling window and only promotes a reading to the big display
 * once it has held steady — fast enough to be useful, slow enough to be right.
 */

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// Sung and played pitch range we care about. Below E2 the FFT cannot separate
// semitones at a usable window size, and above E6 almost everything is
// harmonics rather than fundamentals.
export const LOW_MIDI = 40
export const HIGH_MIDI = 88

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/**
 * Pre-compute which FFT bins belong to each note.
 *
 * Done once at startup: per-frame this is just array lookups, which is what
 * keeps the detector cheap enough to run every animation frame.
 */
export function noteBands(sampleRate, fftSize, low = LOW_MIDI, high = HIGH_MIDI) {
  const binWidth = sampleRate / fftSize
  const bands = []
  for (let midi = low; midi <= high; midi++) {
    const hz = midiToHz(midi)
    // Half a semitone either side: the band for this note and nothing else.
    const from = Math.max(1, Math.floor((hz * 2 ** (-0.5 / 12)) / binWidth))
    const to = Math.min(fftSize / 2 - 1, Math.ceil((hz * 2 ** (0.5 / 12)) / binWidth))
    bands.push({ midi, pc: midi % 12, from, to })
  }
  return bands
}

/**
 * Fold a magnitude spectrum into twelve pitch classes.
 *
 * Takes the peak in each note's band rather than the sum, because spectral
 * leakage spreads a strong partial across neighbours and summing would let one
 * loud note bleed into the semitones either side of it.
 */
export function spectrumToChroma(magnitudes, bands) {
  // Peak per note first.
  const peaks = new Array(bands.length)
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b]
    let peak = 0
    for (let i = band.from; i <= band.to; i++) {
      if (magnitudes[i] > peak) peak = magnitudes[i]
    }
    peaks[b] = peak
  }

  // Then take the noise floor out. A room puts energy in *every* band, and
  // since we take the peak of each band that noise lands in all twelve pitch
  // classes equally — which flattens the chroma until no key correlates with
  // anything. Measured: at normal room noise this was the difference between
  // a usable reading and the detector never committing at all.
  //
  // The median note is a good floor estimate: in real music most of the 49
  // notes in range are *not* sounding at any moment, so the median is noise.
  const sorted = [...peaks].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length / 2)]

  const chroma = new Array(12).fill(0)
  for (let b = 0; b < bands.length; b++) {
    const above = peaks[b] - floor
    if (above > 0) chroma[bands[b].pc] += above
  }
  return chroma
}

/** Pearson correlation, the comparison Krumhansl-Schmuckler is built on. */
function correlate(profile, chroma) {
  const pm = profile.reduce((a, b) => a + b, 0) / 12
  const cm = chroma.reduce((a, b) => a + b, 0) / 12
  let num = 0
  let dp = 0
  let dc = 0
  for (let i = 0; i < 12; i++) {
    const a = profile[i] - pm
    const b = chroma[i] - cm
    num += a * b
    dp += a * a
    dc += b * b
  }
  const den = Math.sqrt(dp * dc)
  return den ? num / den : 0
}

/** Score all 24 keys against a chroma vector, best first. */
export function scoreKeys(chroma) {
  const total = chroma.reduce((a, b) => a + b, 0)
  if (total <= 0) return []
  const norm = chroma.map((v) => v / total)
  const out = []
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = norm.map((_, i) => norm[(i + tonic) % 12])
    out.push({ pc: tonic, mode: 'major', score: correlate(MAJOR, rotated), name: NAMES[tonic] })
    out.push({ pc: tonic, mode: 'minor', score: correlate(MINOR, rotated), name: NAMES[tonic] })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

const SILENT = -100 // dBFS floor; below this a frame carries no information

/**
 * Accumulates chroma over time and decides when to commit to a key.
 *
 * `halfLife` is how long old evidence takes to lose half its weight. Short
 * reacts fast and jitters; long is steady but slow to follow a key change.
 */
export class KeyTracker {
  /**
   * `halfLife`   seconds for old evidence to lose half its weight. Measured:
   *   anywhere from 3 to 15 keeps the answer right, so this is set short for
   *   responsiveness rather than long for safety
   * `provisionalAfter` seconds before showing a hedged best guess. A band is
   *   identified in about two seconds, but a single unaccompanied voice takes
   *   twelve or more -- one note at a time genuinely carries little. Rather
   *   than show nothing for that long, show a guess early and label it
   * `holdFrames` how long a first answer must hold before it is shown
   * `switchFrames` how long a *challenger* must hold to replace a settled
   *   answer — much longer, so one borrowed chord cannot steal the key
   * `switchMargin` how much better a challenger must score than the settled
   *   key. Measured: below 0.08 a single borrowed chord takes the key over;
   *   from 0.08 up it holds, and a genuine modulation is still followed
   * `minNotes`   pitch classes that must be present before answering at all
   */
  constructor({
    halfLife = 8,
    holdFrames = 15,
    switchFrames = 70,
    minNotes = 5,
    switchMargin = 0.12,
    provisionalAfter = 4,
    firstScore = 0.82,
    firstMargin = 0.035,
  } = {}) {
    this.halfLife = halfLife
    this.holdFrames = holdFrames
    this.switchFrames = switchFrames
    this.minNotes = minNotes
    this.switchMargin = switchMargin
    this.firstScore = firstScore
    this.firstMargin = firstMargin
    this.provisionalAfter = provisionalAfter
    this.reset()
  }

  reset() {
    this.chroma = new Array(12).fill(0)
    this.candidate = null
    this.candidateFrames = 0
    this.committed = null
    this.loudFrames = 0
    this.notesSeen = 0
    this.secondsHeard = 0
    this.ranked = null
  }

  /** Feed one frame. `level` is 0..1 loudness, used to ignore silence. */
  push(chroma, dt, level) {
    if (level <= 0) return
    this.loudFrames += 1
    this.secondsHeard += dt

    // Normalise per frame so a loud note doesn't outvote a quiet one; what
    // matters is which notes are sounding, not how hard they were hit.
    const sum = chroma.reduce((a, b) => a + b, 0)
    if (sum <= 0) return
    const decay = Math.pow(0.5, dt / this.halfLife)
    for (let i = 0; i < 12; i++) {
      this.chroma[i] = this.chroma[i] * decay + (chroma[i] / sum) * (1 - decay)
    }

    // A key has seven notes. One triad is three, and three notes fit several
    // keys equally well — answering from that is guessing, not detecting. Wait
    // until enough different notes have actually been heard.
    const total = this.chroma.reduce((a, b) => a + b, 0)
    this.notesSeen = this.chroma.filter((v) => v / total > 0.05).length
    if (this.notesSeen < this.minNotes) return

    const ranked = scoreKeys(this.chroma)
    if (!ranked.length) return
    this.ranked = ranked
    const top = ranked[0]
    const id = `${top.pc}:${top.mode}`

    if (this.candidate === id) {
      this.candidateFrames += 1
    } else {
      this.candidate = id
      this.candidateFrames = 1
    }

    // Changing a settled answer is deliberately much harder than making the
    // first one. A song sits on chords that are not the tonic all the time --
    // the 4, the 5, a borrowed chord -- and each of those briefly looks like a
    // different key. Only sustained evidence is a real key change.
    const settled = this.committed && this.committed.id !== id
    const needed = settled ? this.switchFrames : this.holdFrames

    // A challenger also has to be decisively better, not just persistent. A
    // passing chord nudges the balance slightly and briefly; a genuine key
    // change moves it clearly and keeps it moved. Comparing against the
    // incumbent's *current* score is what separates the two.
    if (settled) {
      const incumbent = ranked.find((k) => `${k.pc}:${k.mode}` === this.committed.id)
      if (incumbent && top.score - incumbent.score < this.switchMargin) {
        this.candidateFrames = 0
        return
      }
    }

    const margin = top.score - (ranked[1]?.score ?? 0)

    // The first answer has to actually be a good answer. A bare triad fits
    // several keys almost equally well -- C-E-G scores nearly as well as E
    // minor as it does as C major -- and committing to one of those early is
    // worse than saying nothing, because the hysteresis above will then defend
    // the wrong answer. So wait for a reading that genuinely fits and genuinely
    // beats its rivals.
    if (!this.committed && (top.score < this.firstScore || margin < this.firstMargin)) return

    if (this.candidateFrames >= needed) {
      this.committed = { ...top, id, margin, ranked }
    }
  }

  read() {
    // Never sit on "still deciding" indefinitely. If the quality gate has not
    // been satisfied after a while, show the best guess so far and label it as
    // one -- a hedged answer is useful, an empty screen after singing a whole
    // song is not.
    if (!this.committed) {
      if (this.secondsHeard < this.provisionalAfter || !this.ranked) return null
      const best = this.ranked[0]
      const gap = best.score - (this.ranked[1]?.score ?? 0)
      return {
        ...best,
        margin: gap,
        ranked: this.ranked,
        provisional: true,
        confidence: Math.max(0.05, Math.min(0.45, 0.4 * best.score + 2 * gap)),
      }
    }

    const { score, margin } = this.committed
    // Confidence blends "how well does this key fit" with "how much better
    // than the runner-up", because a strong fit that two keys share equally is
    // not something to be confident about.
    const confidence = Math.max(0, Math.min(1, 0.6 * score + 3 * margin))
    return { ...this.committed, confidence, provisional: false }
  }

  /** True once we have heard enough to say anything at all. */
  get warmedUp() {
    return this.loudFrames > 15
  }
}

/** Convert an AnalyserNode's dB output to linear magnitudes, gated at silence. */
export function dbToMagnitudes(db, out) {
  const target = out ?? new Float32Array(db.length)
  for (let i = 0; i < db.length; i++) {
    target[i] = db[i] <= SILENT ? 0 : 10 ** (db[i] / 20)
  }
  return target
}

export const keyLabel = (pc) => NAMES[pc]
