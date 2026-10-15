/**
 * The 24 keys, spelled properly.
 *
 * Pitch classes alone aren't enough to teach a key. A scale has one of each
 * letter name, in order, and that is what makes it readable: F# major is
 * F# G# A# B C# D# E#, not "6, 8, 10, 11, 1, 3, 5" and not a mix of sharps and
 * flats. So each key carries its tonic *letter* as well as its pitch class, and
 * the spelling falls out from walking the letters.
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
export const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]

// Conventional spelling for each key — the one with six accidentals or fewer,
// which is the one sheet music and other musicians actually use.
export const KEYS = [
  // major, around the circle of fifths from C
  { name: 'C major', tonic: 'C', letter: 0, pc: 0, mode: 'major', sig: 0 },
  { name: 'G major', tonic: 'G', letter: 4, pc: 7, mode: 'major', sig: 1 },
  { name: 'D major', tonic: 'D', letter: 1, pc: 2, mode: 'major', sig: 2 },
  { name: 'A major', tonic: 'A', letter: 5, pc: 9, mode: 'major', sig: 3 },
  { name: 'E major', tonic: 'E', letter: 2, pc: 4, mode: 'major', sig: 4 },
  { name: 'B major', tonic: 'B', letter: 6, pc: 11, mode: 'major', sig: 5 },
  { name: 'F# major', tonic: 'F#', letter: 3, pc: 6, mode: 'major', sig: 6 },
  { name: 'Db major', tonic: 'Db', letter: 1, pc: 1, mode: 'major', sig: -5 },
  { name: 'Ab major', tonic: 'Ab', letter: 5, pc: 8, mode: 'major', sig: -4 },
  { name: 'Eb major', tonic: 'Eb', letter: 2, pc: 3, mode: 'major', sig: -3 },
  { name: 'Bb major', tonic: 'Bb', letter: 6, pc: 10, mode: 'major', sig: -2 },
  { name: 'F major', tonic: 'F', letter: 3, pc: 5, mode: 'major', sig: -1 },
  // natural minor
  { name: 'A minor', tonic: 'A', letter: 5, pc: 9, mode: 'minor', sig: 0 },
  { name: 'E minor', tonic: 'E', letter: 2, pc: 4, mode: 'minor', sig: 1 },
  { name: 'B minor', tonic: 'B', letter: 6, pc: 11, mode: 'minor', sig: 2 },
  { name: 'F# minor', tonic: 'F#', letter: 3, pc: 6, mode: 'minor', sig: 3 },
  { name: 'C# minor', tonic: 'C#', letter: 0, pc: 1, mode: 'minor', sig: 4 },
  { name: 'G# minor', tonic: 'G#', letter: 4, pc: 8, mode: 'minor', sig: 5 },
  { name: 'Eb minor', tonic: 'Eb', letter: 2, pc: 3, mode: 'minor', sig: -6 },
  { name: 'Bb minor', tonic: 'Bb', letter: 6, pc: 10, mode: 'minor', sig: -5 },
  { name: 'F minor', tonic: 'F', letter: 3, pc: 5, mode: 'minor', sig: -4 },
  { name: 'C minor', tonic: 'C', letter: 0, pc: 0, mode: 'minor', sig: -3 },
  { name: 'G minor', tonic: 'G', letter: 4, pc: 7, mode: 'minor', sig: -2 },
  { name: 'D minor', tonic: 'D', letter: 1, pc: 2, mode: 'minor', sig: -1 },
]

/** Spell one scale: one of each letter, in order, with accidentals derived. */
export function spellScale(key) {
  const steps = key.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS
  return steps.map((semitones, degree) => {
    const letterIndex = (key.letter + degree) % 7
    const natural = LETTER_PC[letterIndex]
    const target = (key.pc + semitones) % 12
    // How far the letter has to bend to land on the note we need.
    let bend = (target - natural + 12) % 12
    if (bend > 6) bend -= 12
    const accidental = bend > 0 ? '#'.repeat(bend) : 'b'.repeat(-bend)
    return LETTERS[letterIndex] + accidental
  })
}

/** Pitch classes of the scale, for lighting up a keyboard. */
export function scalePitchClasses(key) {
  const steps = key.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS
  return steps.map((s) => (key.pc + s) % 12)
}

/** MIDI notes, ascending from `octave`, with the tonic repeated on top. */
export function scaleMidi(key, octave = 4) {
  const steps = key.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS
  const root = 12 * (octave + 1) + key.pc
  return [...steps.map((s) => root + s), root + 12]
}

/** "2 sharps (F#, C#)" — the thing a beginner actually needs to memorise. */
export function signatureText(key) {
  if (key.sig === 0) return 'No sharps or flats'
  const SHARP_ORDER = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']
  const FLAT_ORDER = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']
  const count = Math.abs(key.sig)
  const list = (key.sig > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, count)
  const word = key.sig > 0 ? 'sharp' : 'flat'
  return `${count} ${word}${count === 1 ? '' : 's'} (${list.join(', ')})`
}

/** The relative major/minor — the key that shares this one's notes. */
export function relativeOf(key) {
  const wantMode = key.mode === 'major' ? 'minor' : 'major'
  const wantPc = key.mode === 'major' ? (key.pc + 9) % 12 : (key.pc + 3) % 12
  return KEYS.find((k) => k.mode === wantMode && k.pc === wantPc) ?? null
}

/**
 * Keys ordered easiest-first.
 *
 * Not the circle of fifths: a beginner should meet C, G, F, D before F# major.
 * Fewer accidentals is genuinely easier to read and to find under the hands.
 */
export function byDifficulty(mode) {
  return KEYS.filter((k) => k.mode === mode).sort(
    // Fewest accidentals first, and sharps before flats when it's a tie. That
    // walks you C, G, F, D, Bb, A, Eb... alternating out from C in both
    // directions, which is how keys are usually taught.
    (a, b) => Math.abs(a.sig) - Math.abs(b.sig) || b.sig - a.sig,
  )
}

/**
 * A triad built on a scale degree, stacked within the key.
 *
 * Taking every other scale note gives the right chord quality for free — the
 * I is major and the vi is minor because of where the scale's own semitones
 * fall, not because of a lookup table.
 */
export function diatonicTriad(key, degree, octave = 3) {
  const steps = key.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS
  const root = 12 * (octave + 1) + key.pc
  return [0, 2, 4].map((offset) => {
    const i = degree + offset
    return root + steps[i % 7] + 12 * Math.floor(i / 7)
  })
}

/** I - IV - V - I: the shortest thing that makes a key unmistakable. */
export function cadence(key, octave = 3) {
  return [0, 3, 4, 0].map((degree) => diatonicTriad(key, degree, octave))
}

/**
 * How close one key is to another, in terms a musician would use.
 *
 * "Wrong" is useless feedback. Keys sit at measurable distances from each
 * other: a fifth away shares six of its seven notes, the relative shares all
 * seven. Naming the actual difference — "only F natural instead of F sharp" —
 * teaches something that a red cross does not.
 */
export function compareKeys(guess, actual) {
  const guessKey = { ...guess, letter: 0, pc: guess.pc, mode: guess.mode }
  const guessNotes = new Set(
    (guess.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS).map((s) => (guess.pc + s) % 12),
  )
  const actualNotes = new Set(scalePitchClasses(actual))
  const shared = [...guessNotes].filter((pc) => actualNotes.has(pc))

  // Steps around the circle of fifths. 7 is its own inverse mod 12, which is
  // what makes this one line instead of a search.
  let fifths = ((guess.pc - actual.pc) * 7) % 12
  if (fifths > 6) fifths -= 12
  if (fifths < -6) fifths += 12

  const exact = guess.pc === actual.pc && guess.mode === actual.mode
  const relative =
    shared.length === 7 && !exact

  const missing = [...actualNotes].filter((pc) => !guessNotes.has(pc))
  const extra = [...guessNotes].filter((pc) => !actualNotes.has(pc))

  let verdict
  if (exact) verdict = 'exact'
  else if (relative) verdict = 'relative'
  else if (guess.pc === actual.pc) verdict = 'parallel'
  else if (Math.abs(fifths) === 1) verdict = 'neighbour'
  else if (Math.abs(fifths) === 2) verdict = 'near'
  else verdict = 'far'

  return {
    verdict,
    shared: shared.length,
    fifths,
    missing,
    extra,
    useFlats: key_prefers_flats_safe(actual),
  }
}

const key_prefers_flats_safe = (k) => key_prefers_flats_inner(k.pc, k.mode)
const key_prefers_flats_inner = (pc, mode) => FLAT_KEYS_SET.has(`${pc}:${mode}`)
const FLAT_KEYS_SET = new Set([
  '5:major', '10:major', '3:major', '8:major', '1:major', '6:major',
  '2:minor', '7:minor', '0:minor', '5:minor', '10:minor', '3:minor',
])

export const findKey = (name) => KEYS.find((k) => k.name === name) ?? KEYS[0]
