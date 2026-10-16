/**
 * Listen to someone play and say what would make it sound better.
 *
 * Everything here is measured from the MIDI, never guessed. Each check knows
 * one specific thing that makes playing sound like a learner, speaks up only
 * when the numbers show it, and quotes the number back so the advice is about
 * this take rather than about beginners in general.
 *
 * Tips are short on purpose. Three useful sentences beat a paragraph nobody
 * reads while sitting at a keyboard.
 */

/**
 * Two notes belong to the same chord while each lands within CHORD_GAP of the
 * one before it, up to a total sprawl of CHORD_MAX.
 *
 * This used to measure every note against the *start* of the chord with a 70ms
 * window, which quietly made it impossible for a chord to last longer than
 * 70ms. A human rolls a triad over 80-150ms -- that is the thing that makes it
 * sound human -- so real playing was chopped into two or three "chords" per
 * chord. That tripled the note count and turned the bass line into a series of
 * leaps, so every take came back with "that is a lot of notes" and "you are
 * jumping between chords" no matter how it was played.
 *
 * Chaining from the previous note instead lets a roll hold together; the
 * CHORD_MAX cap stops a fast run from chaining into one enormous chord.
 */
const CHORD_GAP = 0.12
const CHORD_MAX = 0.26
const BASS_CEILING = 52 // E3 -- below here is clearly a left hand

/** Group raw note events into chords by start time. */
export function groupChords(events) {
  const sorted = [...events].sort((a, b) => a.time - b.time)
  const chords = []
  for (const event of sorted) {
    const last = chords[chords.length - 1]
    const chainable =
      last && event.time - last.end <= CHORD_GAP && event.time - last.start <= CHORD_MAX
    if (chainable) {
      last.notes.push(event)
      last.end = Math.max(last.end, event.time)
    } else {
      chords.push({ start: event.time, end: event.time, notes: [event] })
    }
  }
  return chords
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)

/**
 * Percentile of an unsorted list.
 *
 * Dynamics are read from the 10th and 90th rather than the outright loudest
 * and quietest: one accidental thump would otherwise report a wide dynamic
 * range across an otherwise completely flat take.
 */
function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))
  return sorted[index]
}

/** How uneven a set of numbers is, relative to its own size. */
function variation(values) {
  if (values.length < 2) return 0
  const avg = mean(values)
  if (avg <= 0) return 0
  const spread = Math.sqrt(mean(values.map((v) => (v - avg) ** 2)))
  return spread / avg
}

/**
 * The voicing of `pcs` that moves least from the notes you are already on.
 *
 * This is what "use an inversion" means in practice, so the coach can show the
 * actual notes rather than name the concept and leave you to work it out.
 */
export function nearestVoicing(fromNotes, pcs) {
  if (!fromNotes.length) return pcs.map((pc) => pc + 60)
  const anchor = mean(fromNotes)
  return pcs
    .map((pc) => {
      // Every octave of this pitch class in reach; keep the closest to the
      // middle of the hand you already have down.
      let best = null
      for (let octave = 2; octave <= 7; octave += 1) {
        const note = pc + 12 * octave
        if (best === null || Math.abs(note - anchor) < Math.abs(best - anchor)) best = note
      }
      return best
    })
    .sort((a, b) => a - b)
}

/** Total semitones your hand travels between two voicings. */
export function travel(fromNotes, toNotes) {
  if (!fromNotes.length || !toNotes.length) return 0
  return mean(toNotes.map((n) => Math.min(...fromNotes.map((f) => Math.abs(n - f)))))
}

/**
 * @param events {note, velocity (0-1), time (s), duration (s)}[]
 */
export function analysePerformance(events) {
  if (!events || events.length < 6) {
    return { enough: false, tips: [], praise: [], stats: null, chords: [] }
  }

  const chords = groupChords(events)
  const velocities = events.map((e) => e.velocity)
  const notes = events.map((e) => e.note)

  // How much louder is a loud note than a quiet one, ignoring the extremes.
  const dynamicRange = percentile(velocities, 0.9) - percentile(velocities, 0.1)

  // Does the top note of each chord sing out above the rest? This is the
  // specific thing that turns a block of notes into a tune.
  const leads = chords
    .filter((c) => c.notes.length > 1)
    .map((c) => {
      const sorted = [...c.notes].sort((a, b) => a.note - b.note)
      const top = sorted[sorted.length - 1]
      return top.velocity - mean(sorted.slice(0, -1).map((n) => n.velocity))
    })
  const leadMargin = mean(leads)

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
  const gapVariation = variation(gaps)

  const span = events[events.length - 1].time - events[0].time
  const density = span > 0 ? chords.length / span : 0

  // How much of each chord's slot you actually hold it for. Needs note-off,
  // so it is only meaningful once durations have been filled in.
  const timed = events.filter((e) => e.duration > 0)
  const avgGap = mean(gaps)
  const holdRatio = timed.length >= 4 && avgGap > 0 ? mean(timed.map((e) => e.duration)) / avgGap : null

  const stats = {
    chords: chords.length,
    notes: events.length,
    dynamicRange,
    leadMargin,
    avgRoll,
    avgLeap,
    usesLeftHand,
    lowest,
    gapVariation,
    density,
    holdRatio,
    seconds: span,
  }

  // Each tip carries the number that triggered it and a severity, so the list
  // can be ordered worst-first instead of by whichever check happens to run
  // first. `evidence` is what makes it this take's advice and not a leaflet.
  const tips = []

  if (dynamicRange < 0.18) {
    tips.push({
      id: 'dynamics',
      severity: (0.18 - dynamicRange) / 0.18,
      title: 'Every note is about the same volume',
      evidence: `Your loudest and quietest were only ${Math.round(dynamicRange * 100)}% apart. Aim for 30% or more.`,
      detail: 'Lean on the top note of each chord and ease off at the end of a line.',
      visual: 'dynamics',
    })
  }

  if (leads.length >= 3 && leadMargin < 0.03) {
    tips.push({
      id: 'melody',
      severity: Math.min(1, (0.03 - leadMargin) / 0.08),
      title: 'The top note is buried',
      evidence:
        leadMargin < 0
          ? 'You are hitting the top note softer than the notes underneath it.'
          : 'Your top note is barely louder than the rest of the chord.',
      detail: 'People hear the top note as the tune. Let that finger land heavier than the others.',
    })
  }

  if (rolls.length >= 3 && avgRoll < 0.012) {
    tips.push({
      id: 'roll',
      severity: (0.012 - avgRoll) / 0.012,
      title: 'Your chords land dead flat',
      evidence: `Notes are arriving ${Math.round(avgRoll * 1000)}ms apart — effectively all at once.`,
      detail: 'Let a chord arrive a hair apart, bottom to top. It is the difference between a person and a sequencer.',
    })
  }

  if (!usesLeftHand) {
    tips.push({
      id: 'lefthand',
      severity: 0.8,
      title: 'Nothing is happening down low',
      evidence: `Your lowest note all take was ${noteName(lowest)}.`,
      detail: 'Add the bottom note of each chord an octave or two below with your left hand. Instantly fuller.',
    })
  }

  if (avgLeap > 5) {
    const worst = worstLeap(chords)
    tips.push({
      id: 'inversions',
      severity: Math.min(1, (avgLeap - 5) / 7),
      title: 'You are jumping between chords',
      evidence: `Your hand moves ${avgLeap.toFixed(1)} semitones between chords on average${
        worst ? `, and ${worst.distance} at the worst point` : ''
      }.`,
      detail: 'Use an inversion — the same chord, notes reordered — and pick whichever is nearest your hand.',
      visual: 'inversion',
      worst,
    })
  }

  if (gaps.length > 3 && gapVariation < 0.12) {
    tips.push({
      id: 'rhythm',
      severity: (0.12 - gapVariation) / 0.12,
      title: 'Everything is evenly spaced',
      evidence: `Your chords are landing like a metronome — ${Math.round(gapVariation * 100)}% variation.`,
      detail: 'Hold some chords longer than others. Try landing on beats 1 and 3 only and letting them ring.',
      visual: 'timing',
    })
  }

  if (density > 2.4) {
    tips.push({
      id: 'space',
      severity: Math.min(1, (density - 2.4) / 2),
      title: 'That is a lot of notes',
      evidence: `${density.toFixed(1)} chords a second — about ${Math.round(density * 60)} a minute.`,
      detail: 'Leave gaps. A singer needs room — play less and let the chords hold.',
      visual: 'timing',
    })
  }

  if (holdRatio !== null && holdRatio < 0.45) {
    tips.push({
      id: 'hold',
      severity: Math.min(1, (0.45 - holdRatio) / 0.45),
      title: 'You are letting go too early',
      evidence: `Each chord is held for about ${Math.round(holdRatio * 100)}% of its slot, so there is silence between them.`,
      detail: 'Keep the keys down until the next chord. Under a singer that gap reads as a stumble.',
    })
  }

  // Say what went right too, or the whole thing reads as a telling-off.
  const praise = []
  if (dynamicRange >= 0.25) praise.push('good dynamics')
  if (leads.length >= 3 && leadMargin >= 0.05) praise.push('the tune coming through on top')
  if (usesLeftHand) praise.push('both hands working')
  if (avgLeap > 0 && avgLeap <= 4) praise.push('smooth chord changes')
  if (rolls.length >= 3 && avgRoll >= 0.012) praise.push('a human feel to the chords')
  if (gaps.length > 3 && gapVariation >= 0.18) praise.push('rhythm that breathes')
  if (holdRatio !== null && holdRatio >= 0.6 && holdRatio <= 1.2) praise.push('chords held through')

  tips.sort((a, b) => b.severity - a.severity)

  return { enough: true, chords, tips, praise, stats }
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const noteName = (midi) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`

/**
 * The single worst chord change in the take, with the voicing that would have
 * avoided it — so the tip can show two keyboards instead of a definition.
 */
function worstLeap(chords) {
  let worst = null
  for (let i = 1; i < chords.length; i += 1) {
    const from = chords[i - 1].notes.map((n) => n.note).sort((a, b) => a - b)
    const to = chords[i].notes.map((n) => n.note).sort((a, b) => a - b)
    if (from.length < 2 || to.length < 2) continue
    const distance = Math.abs(Math.min(...to) - Math.min(...from))
    if (!worst || distance > worst.distance) {
      const pcs = [...new Set(to.map((n) => ((n % 12) + 12) % 12))]
      worst = { from, to, distance, better: nearestVoicing(from, pcs) }
    }
  }
  if (!worst || worst.distance < 5) return null
  // Only worth showing if the suggestion is actually an improvement.
  if (travel(worst.from, worst.better) >= travel(worst.from, worst.to)) return null
  return worst
}

/** Plain-English summary of what changed since the last take. */
export function compareTakes(now, before) {
  if (!before || !now) return null
  const moves = []
  const delta = (a, b) => b - a

  const dyn = delta(before.dynamicRange, now.dynamicRange)
  if (Math.abs(dyn) >= 0.05) {
    moves.push(
      dyn > 0
        ? `dynamics up ${Math.round(before.dynamicRange * 100)}% → ${Math.round(now.dynamicRange * 100)}%`
        : `dynamics down ${Math.round(before.dynamicRange * 100)}% → ${Math.round(now.dynamicRange * 100)}%`,
    )
  }

  const leap = delta(before.avgLeap, now.avgLeap)
  if (Math.abs(leap) >= 1) {
    moves.push(
      leap < 0
        ? `smoother changes ${before.avgLeap.toFixed(1)} → ${now.avgLeap.toFixed(1)} semitones`
        : `bigger jumps ${before.avgLeap.toFixed(1)} → ${now.avgLeap.toFixed(1)} semitones`,
    )
  }

  if (!before.usesLeftHand && now.usesLeftHand) moves.push('left hand now in use')

  return moves.length ? moves : null
}
