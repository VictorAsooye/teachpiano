/**
 * Ear-training helpers: parse what the user typed and grade it.
 *
 * Everything compares by *pitch class*, never by spelling, so F# and Gb are
 * the same answer — the goal is to test whether you heard the chord, not
 * whether you spelled it the way the detector happened to.
 */

const NATURALS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

// Compact labels for the key picker. Spelling is cosmetic here: grading is by
// pitch class, so "C#" and "Db" are interchangeable answers.
export const ROOT_CHOICES = [
  { pc: 0, label: 'C' },
  { pc: 1, label: 'C♯' },
  { pc: 2, label: 'D' },
  { pc: 3, label: 'E♭' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 6, label: 'F♯' },
  { pc: 7, label: 'G' },
  { pc: 8, label: 'A♭' },
  { pc: 9, label: 'A' },
  { pc: 10, label: 'B♭' },
  { pc: 11, label: 'B' },
]

/** "F#", "Gb", "bb" -> pitch class, or null if it isn't a note name. */
export function parseNote(text) {
  const match = /^([a-gA-G])([#♯]*|[b♭]*)$/.exec((text || '').trim())
  if (!match) return null
  let pc = NATURALS[match[1].toLowerCase()]
  for (const ch of match[2]) {
    if (ch === '#' || ch === '♯') pc += 1
    else pc -= 1
  }
  return ((pc % 12) + 12) % 12
}

// The detector's qualities collapse into two families for grading. Chord
// recognition genuinely struggles to tell a triad from its 7th (a maj7
// template contains the whole maj template), so grading someone wrong for
// saying "D" when the detector said "Dmaj7" would be testing our algorithm's
// quirks rather than their ear. Major vs minor is the real question.
const MINOR_QUALITIES = new Set(['min', 'min7', 'dim'])

export const familyOf = (quality) => (MINOR_QUALITIES.has(quality) ? 'min' : 'maj')

const SUFFIX_FAMILY = [
  [/^(m|min|minor|-)(6|7|9|11)?$/i, 'min'],
  [/^(dim|o|°|m7b5|ø)$/i, 'min'],
  [/^(maj|major|M)?(6|7|9|11|13)?$/i, 'maj'],
  [/^(sus|sus2|sus4|add9|aug|\+)(7|9)?$/i, 'maj'],
]

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Shapes we can name from a handful of held keys, as intervals above the root.
// Every suffix here must round-trip through parseChord, because a chord played
// on the piano is written into the same answer box you can type into.
const SHAPES = [
  { intervals: [0, 4, 7], suffix: '', family: 'maj' },
  { intervals: [0, 3, 7], suffix: 'm', family: 'min' },
  { intervals: [0, 3, 6], suffix: 'dim', family: 'min' },
  { intervals: [0, 4, 8], suffix: 'aug', family: 'maj' },
  { intervals: [0, 5, 7], suffix: 'sus4', family: 'maj' },
  { intervals: [0, 2, 7], suffix: 'sus2', family: 'maj' },
  { intervals: [0, 4, 7, 11], suffix: 'maj7', family: 'maj' },
  { intervals: [0, 4, 7, 10], suffix: '7', family: 'maj' },
  { intervals: [0, 3, 7, 10], suffix: 'm7', family: 'min' },
  { intervals: [0, 3, 6, 10], suffix: 'm7b5', family: 'min' },
  { intervals: [0, 4, 7, 9], suffix: '6', family: 'maj' },
  { intervals: [0, 3, 7, 9], suffix: 'm6', family: 'min' },
]

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 }

/**
 * Read a chord written as a scale degree: "6", "vi", "VI".
 *
 * The lessons teach the number system — "go to the 4" — because that is what
 * bands actually call. Refusing to accept numbers in the answer box, while
 * teaching numbers three levels earlier, was the app contradicting itself.
 *
 * The quality comes from the key, so "6" in Bb major is Gm without anyone
 * having to say so.
 */
export function parseDegree(text, key) {
  if (!key) return null
  const raw = (text || '').trim()
  const arabic = /^([1-7])(m|min|minor)?$/i.exec(raw)
  const roman = /^(i{1,3}|iv|vi{0,2})$/i.exec(raw)
  if (!arabic && !roman) return null

  const degree = arabic ? Number(arabic[1]) - 1 : ROMAN[roman[1].toLowerCase()] - 1
  const steps = key.mode === 'minor' ? MINOR_STEPS_LOCAL : MAJOR_STEPS_LOCAL
  const pc = (key.pc + steps[degree]) % 12
  // Quality straight from the scale: stack degree, degree+2, degree+4.
  const third = (steps[(degree + 2) % 7] + (degree + 2 >= 7 ? 12 : 0)) - steps[degree]
  const family = ((third % 12) + 12) % 12 === 3 ? 'min' : 'maj'
  const names = key.useFlats ? FLAT_NAMES : SHARP_NAMES
  return { pc, family, label: names[pc] + (family === 'min' ? 'm' : ''), fromDegree: true }
}

const MAJOR_STEPS_LOCAL = [0, 2, 4, 5, 7, 9, 11]
const MINOR_STEPS_LOCAL = [0, 2, 3, 5, 7, 8, 10]

/** MIDI number -> bare note name, for showing what is being played. */
export function noteLabel(midi, useFlats = false) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES
  return names[(((midi % 12) + 12) % 12)]
}

const sameIntervals = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Name a chord from the MIDI notes being held down.
 *
 * Tries the bass note as the root first, so an inversion is reported by what
 * you are actually playing rather than by whichever spelling happens to match.
 * Returns null when the notes don't form a chord we can name — a passing
 * cluster, or two fingers down mid-change.
 */
export function identifyChord(midiNotes, options) {
  // Read defensively rather than destructuring: a default parameter only kicks
  // in for undefined, so an explicit null option bag would throw.
  const useFlats = options?.useFlats ?? false
  if (!midiNotes || midiNotes.length < 3) return null

  const sorted = [...midiNotes].sort((a, b) => a - b)
  const bass = sorted[0] % 12
  const pcs = [...new Set(sorted.map((n) => n % 12))]
  if (pcs.length < 3) return null

  const names = useFlats ? FLAT_NAMES : SHARP_NAMES
  const candidates = [bass, ...pcs.filter((pc) => pc !== bass)]

  for (const root of candidates) {
    const intervals = pcs.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b)
    for (const shape of SHAPES) {
      if (sameIntervals(intervals, shape.intervals)) {
        return {
          pc: root,
          family: shape.family,
          label: names[root] + shape.suffix,
          inverted: root !== bass,
          bassName: names[bass],
        }
      }
    }
  }
  return null
}

/** "F#m7", "Bbmaj7", "am" -> { pc, family, label } */
export function parseChord(text) {
  const raw = (text || '').trim()
  if (!raw) return null

  const rootMatch = /^([a-gA-G])([#♯]|[b♭])?/.exec(raw)
  if (!rootMatch) return null
  const pc = parseNote(rootMatch[0])
  if (pc === null) return null

  const suffix = raw.slice(rootMatch[0].length).trim()
  for (const [pattern, family] of SUFFIX_FAMILY) {
    if (pattern.test(suffix)) {
      return { pc, family, label: raw }
    }
  }
  return null
}

// "B minor" and "Bm" are the same answer to a human, but a naive split on
// whitespace turns the first into two useless tokens. Close that gap up before
// splitting. The quality word has to directly follow a note name, so "A Bm"
// (two separate chords) is left alone.
const SPACED_QUALITY =
  /\b([A-Ga-g][#♯b♭]?)[ \t]+(minor|major|maj|min|dim|aug|sus2|sus4|m|M)\b/g

// "F sharp minor" spelled out longhand.
const SPELLED_ACCIDENTAL = /\b([A-Ga-g])[ \t]+(sharp|flat)\b/gi

/** Split "D A Bm F#m" (or commas, dashes, or "F sharp minor") into chord tokens. */
export function tokenizeChords(text) {
  return (text || '')
    .replace(SPELLED_ACCIDENTAL, (_, note, word) => note + (word.toLowerCase() === 'sharp' ? '#' : 'b'))
    .replace(SPACED_QUALITY, '$1$2')
    .split(/[\s,|/>-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

/**
 * Grade a key guess. Returns one of:
 *   correct  — same tonic, same mode
 *   relative — the relative major/minor (shares all seven notes; a genuinely
 *              defensible answer, and the classic ambiguity in key detection)
 *   parallel — right tonic, wrong mode
 *   wrong
 */
export function gradeKey(guess, actual) {
  if (!guess || !actual) return 'wrong'
  const samePc = guess.pc === actual.pc
  if (samePc && guess.mode === actual.mode) return 'correct'
  if (samePc) return 'parallel'

  const relativeMinorOfActual = (actual.pc + 9) % 12
  const relativeMajorOfActual = (actual.pc + 3) % 12
  if (actual.mode === 'major' && guess.mode === 'minor' && guess.pc === relativeMinorOfActual) {
    return 'relative'
  }
  if (actual.mode === 'minor' && guess.mode === 'major' && guess.pc === relativeMajorOfActual) {
    return 'relative'
  }
  return 'wrong'
}

// A chord has to hold this share of the song's running time before we call it
// part of the progression. Below that it's a passing chord or a stray
// detection, and marking someone wrong for not naming it would be grading them
// against our noise floor rather than their ear.
const CORE_SHARE = 0.04

/**
 * Grade a progression guess against the chords actually found in the song.
 *
 * Compared as sets, not sequences: the detector reports every repeat of a
 * chord across three minutes, so asking someone to reproduce that order is
 * meaningless. Naming the right chords is the real skill.
 *
 * Chords are also weighted by how long they sound. Name the four chords a song
 * is built on and you have answered correctly, even if the detector also found
 * a one-off passing chord somewhere in the third verse.
 */
export function gradeChords(text, songChords, { minShare = CORE_SHARE, key = null } = {}) {
  const totals = new Map()
  let songSeconds = 0

  for (const chord of songChords) {
    if (chord.root === null || chord.root === undefined) continue
    const seconds = Math.max(0, (chord.end ?? 0) - (chord.start ?? 0))
    songSeconds += seconds
    const key = `${chord.root}:${familyOf(chord.quality)}`
    const entry = totals.get(key) ?? {
      key,
      pc: chord.root,
      family: familyOf(chord.quality),
      label: chord.label,
      seconds: 0,
    }
    entry.seconds += seconds
    totals.set(key, entry)
  }

  const all = [...totals.values()].sort((a, b) => b.seconds - a.seconds)
  let core = songSeconds > 0 ? all.filter((c) => c.seconds / songSeconds >= minShare) : all
  if (!core.length) core = all // never grade against an empty answer key
  const coreKeys = new Set(core.map((c) => c.key))
  const fleeting = all.filter((c) => !coreKeys.has(c.key))

  const parsed = []
  const unparsed = []
  for (const token of tokenizeChords(text)) {
    const chord = parseChord(token) ?? parseDegree(token, key)
    if (chord) {
      parsed.push(chord)
    } else {
      unparsed.push(token)
    }
  }

  const guessed = new Set(parsed.map((c) => `${c.pc}:${c.family}`))
  const matched = core.filter((c) => guessed.has(c.key))
  const missed = core.filter((c) => !guessed.has(c.key))
  // Hearing a chord that barely appears is a good ear, not a mistake.
  const bonus = fleeting.filter((c) => guessed.has(c.key))

  const known = new Set(all.map((c) => c.key))
  const extraSeen = new Set()
  const extra = []
  for (const chord of parsed) {
    const key = `${chord.pc}:${chord.family}`
    if (known.has(key) || extraSeen.has(key)) continue
    extraSeen.add(key)
    extra.push(chord)
  }

  return {
    matched,
    missed,
    bonus,
    extra,
    unparsed,
    // People write sentences. Reading chords out of one is a success, not a
    // reason to list every ordinary word back at them -- so unreadable tokens
    // only matter when nothing at all was understood.
    nothingUnderstood: parsed.length === 0,
    total: core.length,
    fleetingMissed: fleeting.filter((c) => !guessed.has(c.key)),
  }
}
