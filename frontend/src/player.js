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

/**
 * Wire an instrument up to be heard.
 *
 * The dry signal goes straight to the output, and the reverb hangs off it as
 * a parallel send rather than sitting in the middle of the chain. That
 * ordering matters more than it looks: a Reverb builds its impulse response
 * by rendering an OfflineAudioContext, and until that finishes -- or if it
 * fails outright, which mobile Safari will do under memory pressure -- a
 * reverb you are routed *through* passes silence. Everything else works
 * perfectly and not one note comes out.
 *
 * Wired as a send, the worst a broken reverb can do is leave the piano dry.
 */
function connectOut(instrument, { decay, send }) {
  instrument.connect(Tone.getDestination())
  try {
    const reverb = new Tone.Reverb({ decay, wet: 1 })
    const level = new Tone.Gain(send)
    instrument.connect(level)
    level.connect(reverb)
    reverb.toDestination()
  } catch {
    /* dry is a perfectly good piano */
  }
  return instrument
}

function buildSynth() {
  // Fast attack, long decay, no sustain -- the shape of a struck string.
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 1.6, sustain: 0.08, release: 1.4 },
    volume: -10,
  })
  return connectOut(synth, { decay: 1.8, send: 0.18 })
}

async function loadInstrument() {
  try {
    const sampler = new Tone.Sampler({ urls: SAMPLE_MAP, baseUrl: SALAMANDER, release: 1 })
    connectOut(sampler, { decay: 2.2, send: 0.15 })
    // Don't hang forever if the sample CDN is unreachable -- fall back
    // instead. Phones on a weak signal hit this far more than desktops do.
    await Promise.race([
      Tone.loaded(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ])
    usingSamples = true
    return sampler
  } catch {
    usingSamples = false
    return buildSynth()
  }
}

/**
 * Make iOS actually play us.
 *
 * On an iPhone or iPad, a page that only makes Web Audio gets the *ambient*
 * audio session, and ambient audio is silenced by the ring/silent switch on
 * the side of the device. The page looks like it is playing -- the transport
 * runs, the keys light up -- and not a sound comes out, which is exactly what
 * a muted phone is supposed to do. Nothing in the app is broken, so there is
 * nothing to find by debugging it.
 *
 * Two fixes, because they cover different iOS versions:
 *
 *  - `navigator.audioSession.type = 'playback'` is the real API for this, and
 *    says "we are a music app, not a UI bleep". Safari 16.4 and up.
 *  - Before that, the way to move off the ambient session was to have an
 *    actual <audio> element playing. A half-second of silence on loop costs
 *    nothing and flips the session for older iOS.
 *
 * Both are no-ops on desktop, so this runs everywhere rather than sniffing
 * for an iPhone and getting the test wrong.
 */
let unlocked = false
let attempted = false

function silentLoopSource() {
  // Built here rather than pasted as a base64 blob so it is inspectable: a
  // 0.5s mono 8kHz WAV of pure zeroes, header and all.
  const rate = 8000
  const samples = rate / 2
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true) // PCM header length
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples * 2, true)
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

function unlockIOS() {
  if (unlocked) return
  unlocked = true

  try {
    if ('audioSession' in navigator) navigator.audioSession.type = 'playback'
  } catch {
    // Older Safari, or a browser that exposes it read-only. The element below
    // is the fallback for exactly this case.
  }

  try {
    const el = new Audio(silentLoopSource())
    el.loop = true
    el.volume = 0.001
    el.setAttribute('playsinline', '')
    // Must be inside the gesture, hence the call from initAudio(). A rejected
    // promise here just means the fallback did not apply; the modern API
    // above may still have worked.
    el.play().catch(() => {})
  } catch {
    /* no HTMLAudioElement -- nothing more to try */
  }
}

/**
 * Must be called from a user gesture -- browsers won't start audio otherwise.
 *
 * Everything that has to happen inside the gesture happens before the first
 * `await`: once execution resumes after one, Safari no longer counts it as
 * user-initiated and silently refuses to start the context.
 */
export async function initAudio() {
  attempted = true
  unlockIOS()
  // Both of these are started synchronously, before anything is awaited.
  const started = Tone.start()
  const resumed = resumeIfSuspended()
  await started
  await resumed
  if (!instrument) {
    loading = loading || loadInstrument()
    instrument = await loading
  }
  return instrument
}

/**
 * iOS parks the audio context when you take a call, lock the phone, or switch
 * tabs, and hands it back in the non-standard state "interrupted". Nothing
 * resumes it on the way back in, so without this the piano works until the
 * first interruption and is mute from then on.
 */
export async function resumeIfSuspended() {
  const raw = Tone.getContext().rawContext
  if (raw && raw.state !== 'running') {
    try {
      await raw.resume()
    } catch {
      /* needs another gesture; the next tap will come back through here */
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && instrument) resumeIfSuspended()
  })
}

/** True when the browser is letting us make sound right now. */
export const audioRunning = () => Tone.getContext().rawContext?.state === 'running'

/** True once something in the app has tried to play a note. */
export const audioAttempted = () => attempted

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

/**
 * Sound one note, for the lesson diagrams you can press.
 *
 * Deliberately does not stopAll() first: tapping your way up a scale should
 * ring like a real piano, with each note still decaying under the next, not
 * cut dead the instant you press the following key.
 */
export async function playMidiNote(midi, duration = 1.2) {
  const piano = await initAudio()
  piano.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), duration)
}

/** Sound several notes at once — a chord diagram's "hear it" button. */
export async function playMidiChord(midis, duration = 1.8) {
  const piano = await initAudio()
  piano.triggerAttackRelease(
    midis.map((m) => Tone.Frequency(m, 'midi').toNote()),
    duration,
  )
}
