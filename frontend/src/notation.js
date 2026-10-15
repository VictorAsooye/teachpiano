/**
 * Show chords as letters, numbers, or solfège.
 *
 * Different players think in different systems and none is more correct. Church
 * bands call numbers ("go to the 4") because numbers survive a key change;
 * choirs often think do-re-mi; sheet music uses letters. Reading a chart in the
 * wrong system is pure friction, so the chart adapts instead of the player.
 *
 * Numbers and solfège are relative to the key's own scale — major scale for a
 * major key, natural minor for a minor one — which is how the lessons teach it
 * ("in C: C=1, D=2, E=3...").
 */

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti']

export const NOTATIONS = [
  { id: 'letters', label: 'Letters', example: 'Bb  Gm  F' },
  { id: 'numbers', label: 'Numbers', example: '1  6m  5' },
  { id: 'solfege', label: 'Do Re Mi', example: 'Do  Lam  Sol' },
]

/**
 * Which degree of the key a pitch class is.
 *
 * Returns the scale degree plus an accidental for notes outside the key — a
 * borrowed chord is still worth naming rather than giving up on.
 */
export function degreeOf(pc, key) {
  if (pc === null || pc === undefined || !key) return null
  const steps = key.mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS
  const interval = (((pc - key.pc) % 12) + 12) % 12

  const exact = steps.indexOf(interval)
  if (exact >= 0) return { degree: exact + 1, accidental: '' }

  // Not in the key: name it against whichever neighbouring degree is closer.
  const flatOf = steps.indexOf((interval + 1) % 12)
  if (flatOf >= 0) return { degree: flatOf + 1, accidental: 'b' }
  const sharpOf = steps.indexOf((interval + 11) % 12)
  if (sharpOf >= 0) return { degree: sharpOf + 1, accidental: '#' }
  return null
}

/** The quality part of a chord label: "Gm7" -> "m7", "Bb" -> "". */
function qualityOf(chord) {
  const suffixes = { maj: '', min: 'm', dim: 'dim', aug: 'aug', sus4: 'sus4', sus2: 'sus2' }
  if (chord.quality in suffixes) return suffixes[chord.quality]
  if (chord.quality === 'min7') return 'm7'
  if (chord.quality === 'maj7') return 'maj7'
  if (chord.quality === '7') return '7'
  return ''
}

/**
 * Re-label a chord in the chosen system.
 *
 * Falls back to the letter name whenever a degree cannot be worked out — an
 * unknown chord is better shown as itself than as a blank.
 */
export function relabel(chord, key, notation) {
  if (notation === 'letters' || !key) return chord.label
  if (chord.root === null || chord.root === undefined) return chord.label

  const degree = degreeOf(chord.root, key)
  if (!degree) return chord.label

  const quality = qualityOf(chord)
  if (notation === 'numbers') {
    return `${degree.accidental}${degree.degree}${quality}`
  }
  if (notation === 'solfege') {
    return `${degree.accidental}${SOLFEGE[degree.degree - 1]}${quality}`
  }
  return chord.label
}
