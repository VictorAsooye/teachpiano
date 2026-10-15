/**
 * Listen to someone play and say what would make it sound better.
 *
 * Everything here is measured from the MIDI, never guessed. Each check knows
 * one specific thing that makes playing sound like a learner, and only speaks
 * up when the numbers actually show it. Silence is a pass.
 *
 * Tips are short on purpose. Three useful sentences beat a paragraph nobody
 * reads while sitting at a keyboard.
 */

const CHORD_WINDOW = 0.07 // notes starting within this of each other are one chord
const BASS_CEILING = 52 // E3 — below here is clearly a left hand

/** Group raw note events into chords by start time. */
export function groupChords(events) {
  const sorted = [...events].sort((a, b) => a.time - b.time)
  const chords = []
  for (const event of sorted) {
    const last = chords[chords.length - 1]
    if (last && event.time - last.start <= CHORD_WINDOW) {
      last.notes.push(event)
      last.end = Math.max(last.end, event.time)
    } else {
      chords.push({ start: event.time, end: event.time, notes: [event] })
    }
  }
  return chords
}

const spread = (values) => (values.length ? Math.max(...values) - Math.min(...values) : 0)
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)

/**
 * @param events {note, velocity (0-1), time (s), duration (s)}[]
 */
export function analysePerformance(events) {
  if (!events || events.length < 6) {
    return { enough: false, tips: [], stats: null }
  }

  const chords = groupChords(events)
  const velocities = events.map((e) => e.velocity)
  const notes = events.map((e) => e.note)

  // How much louder is the loudest note than the quietest?
  const dynamicRange = spread(velocities)

  // How together are the notes of a chord? Exactly 0 means machine-perfect.
  const rolls = chords.filter((c) => c.notes.length > 1).map((c) => c.end - c.start)
  const avgRoll = mean(rolls)

  // Do consecutive chords leap, or move to the nearest shape?
  const bottoms = chords.map((c) => Math.min(...c.notes.map((n) => n.note)))
  const leaps = bottoms.slice(1).map((b, i) => Math.abs(b - bottoms[i]))
  const avgLeap = mean(leaps)

  const lowest = Math.min(...notes)
  const usesLeftHand = lowest < BASS_CEILING

  // Is everything the same length apart?
  const gaps = chords.slice(1).map((c, i) => c.start - chords[i].start)
  const gapSpread = gaps.length > 1 ? spread(gaps) : 0

  const span = events[events.length - 1].time - events[0].time
  const density = span > 0 ? chords.length / span : 0

  const stats = {
    chords: chords.length,
    dynamicRange,
    avgRoll,
    avgLeap,
    usesLeftHand,
    lowest,
    gapSpread,
    density,
    seconds: span,
  }

  const tips = []

  if (dynamicRange < 0.18) {
    tips.push({
      id: 'dynamics',
      title: 'Every note is the same volume',
      detail: 'Lean on the top note of each chord and ease off at the end of a line. This is the single biggest thing that stops playing sounding mechanical.',
    })
  }

  if (rolls.length >= 3 && avgRoll < 0.012) {
    tips.push({
      id: 'roll',
      title: 'Your chords land dead flat',
      detail: 'Let the notes of a chord arrive a hair apart, bottom to top. Barely noticeable, but it is the difference between a person and a sequencer.',
    })
  }

  if (!usesLeftHand) {
    tips.push({
      id: 'lefthand',
      title: 'Nothing is happening down low',
      detail: 'Add the bottom note of each chord an octave or two below with your left hand. Instantly fuller.',
    })
  }

  if (avgLeap > 5) {
    tips.push({
      id: 'inversions',
      title: 'You are jumping between chords',
      detail: 'Use inversions — the same chord, notes reordered — and pick whichever is nearest your hand. Less movement, smoother sound.',
    })
  }

  if (gaps.length > 3 && gapSpread < 0.08) {
    tips.push({
      id: 'rhythm',
      title: 'Everything is evenly spaced',
      detail: 'Hold some chords longer than others. Try landing on beats 1 and 3 only and let them ring.',
    })
  }

  if (density > 2.4) {
    tips.push({
      id: 'space',
      title: 'That is a lot of notes',
      detail: 'Leave gaps. A singer needs room — play less and let the chords hold.',
    })
  }

  // Say what went right too, or the whole thing reads as a telling-off.
  const praise = []
  if (dynamicRange >= 0.25) praise.push('good dynamics')
  if (usesLeftHand) praise.push('both hands working')
  if (avgLeap > 0 && avgLeap <= 4) praise.push('smooth chord changes')
  if (rolls.length >= 3 && avgRoll >= 0.012) praise.push('a human feel to the chords')

  return { enough: true, chords, tips, praise, stats }
}
