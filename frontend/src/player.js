import * as Tone from 'tone'

// Real piano samples if we can reach them, a synth if we can't. Either way the
// rest of the app just calls playChords()/playScale().
const SALAMANDER = 'https://tonejs.github.io/audio/salamander/'
const SAMPLE_MAP = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3',
}

let instrument = null
let loading = null
let usingSamples = false

function buildSynth() {
  // Fast attack, long decay, no sustain -- the shape of a struck string.
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 1.6, sustain: 0.08, release: 1.4 },
    volume: -10,
  })
  const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).toDestination()
  synth.connect(reverb)
  return synth
}

async function loadInstrument() {
  try {
    const sampler = new Tone.Sampler({ urls: SAMPLE_MAP, baseUrl: SALAMANDER, release: 1 })
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.15 }).toDestination()
    sampler.connect(reverb)
    // Don't hang forever if the sample CDN is unreachable -- fall back instead.
    await Promise.race([
      Tone.loaded(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    usingSamples = true
    return sampler
  } catch {
    usingSamples = false
    return buildSynth()
  }
}

/** Must be called from a user gesture -- browsers won't start audio otherwise. */
export async function initAudio() {
  await Tone.start()
  if (!instrument) {
    loading = loading || loadInstrument()
    instrument = await loading
  }
  return instrument
}

export const isUsingSamples = () => usingSamples

export function stopAll() {
  Tone.getTransport().stop()
  Tone.getTransport().cancel()
  Tone.getTransport().position = 0
  if (instrument) instrument.releaseAll?.()
}

const MAX_SUSTAIN = 4 // seconds; holding a 20-second chord sounds like a drone

/**
 * Play a chord list back in its original timing.
 * `onChord(index)` fires as each chord starts, `onEnd()` when the run finishes.
 */
export async function playChords(chords, { startIndex = 0, onChord, onEnd } = {}) {
  const piano = await initAudio()
  stopAll()

  const playable = chords.slice(startIndex).filter((c) => c.notes && c.notes.length)
  if (!playable.length) return 0

  const offset = chords[startIndex].start
  const transport = Tone.getTransport()

  playable.forEach((chord) => {
    const at = Math.max(0, chord.start - offset)
    const held = Math.min(Math.max(chord.end - chord.start, 0.25), MAX_SUSTAIN)
    const index = chords.indexOf(chord)
    transport.schedule((time) => {
      piano.triggerAttackRelease(chord.notes, held, time)
      // Called directly rather than through Tone.Draw. Draw only fires while
      // requestAnimationFrame is running and drops anything it can't paint
      // within 250ms, so a background tab freezes the highlight on whatever
      // chord was playing when you looked away. The transport clock runs in a
      // worker and doesn't stall. It fires one lookAhead (~100ms) before the
      // sound, which if anything helps you read ahead.
      if (onChord) onChord(index)
    }, at)
  })

  const last = playable[playable.length - 1]
  const total = last.end - offset
  // Note the direct callback here rather than Draw: Draw drops anything it
  // can't paint within 250ms, so in a backgrounded tab the "finished" event
  // never arrives and the UI stays stuck on Stop forever. The transport clock
  // runs in a worker and keeps firing regardless.
  transport.schedule(() => {
    // Deferred out of the audio callback: onEnd stops and rewinds the
    // transport, and mutating it from inside one of its own scheduled events
    // is what Tone warns about.
    if (onEnd) setTimeout(onEnd, 0)
  }, total + 0.1)

  transport.start()
  return total
}

/** Play the key's scale up and down. */
export async function playScale(notes, { noteLength = 0.42, onNote, onEnd } = {}) {
  const piano = await initAudio()
  stopAll()

  const transport = Tone.getTransport()
  notes.forEach((note, i) => {
    transport.schedule((time) => {
      piano.triggerAttackRelease(note, noteLength * 0.95, time)
      if (onNote) onNote(i)
    }, i * noteLength)
  })
  transport.schedule(() => {
    if (onEnd) setTimeout(onEnd, 0)
  }, notes.length * noteLength + 0.1)

  transport.start()
  return notes.length * noteLength
}

/** Play a run of MIDI notes in order — a scale, an arpeggio, a cadence. */
export async function playMidiSequence(midiNotes, { noteLength = 0.4, onNote, onEnd } = {}) {
  const piano = await initAudio()
  stopAll()

  const transport = Tone.getTransport()
  midiNotes.forEach((midi, i) => {
    transport.schedule((time) => {
      const note = Array.isArray(midi)
        ? midi.map((n) => Tone.Frequency(n, 'midi').toNote())
        : Tone.Frequency(midi, 'midi').toNote()
      piano.triggerAttackRelease(note, noteLength * 0.95, time)
      if (onNote) onNote(i)
    }, i * noteLength)
  })
  transport.schedule(() => {
    if (onEnd) setTimeout(onEnd, 0)
  }, midiNotes.length * noteLength + 0.1)

  transport.start()
  return midiNotes.length * noteLength
}

/** Play one chord on its own, for the "hear this chord" buttons. */
export async function playOneChord(notes, duration = 1.6) {
  const piano = await initAudio()
  piano.triggerAttackRelease(notes, duration)
}

/**
 * Sound a single MIDI note, for playing along on a controller.
 *
 * Scheduled with `immediate()` rather than the default `now()`. Tone's default
 * lookAhead is 100ms: every scheduled event is placed a tenth of a second in
 * the future so the transport can hit its timing exactly. That is right for
 * playing a progression back and completely wrong for live playing, where it
 * is just 100ms of lag between pressing a key and hearing it.
 *
 * Deliberately synchronous. Awaiting initAudio() per note would add a promise
 * tick to every keypress, and on the very first note it would stall until all
 * 22 piano samples had downloaded. Callers warm the instrument up first
 * instead; until then there is nothing to play through.
 */
export function midiNoteOn(midi, velocity = 0.8) {
  if (!instrument) return
  instrument.triggerAttack(Tone.Frequency(midi, 'midi').toNote(), Tone.immediate(), velocity)
}

export function midiNoteOff(midi) {
  if (!instrument) return
  instrument.triggerRelease(Tone.Frequency(midi, 'midi').toNote(), Tone.immediate())
}

/** True once the piano is loaded and can respond to a keypress instantly. */
export const instrumentReady = () => instrument !== null
