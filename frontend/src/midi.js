/**
 * Web MIDI input — listen to a piano plugged in over USB.
 *
 * Chrome and Edge support this natively with no driver or extra software. It
 * needs a secure context, which http://127.0.0.1 already counts as, so the
 * launcher URL works as-is.
 */

export const midiSupported = () =>
  typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPads report themselves as desktop Macs; touch points give them away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * Why a piano cannot be connected here.
 *
 * On iPhone and iPad this is not a browser choice: every browser on iOS runs
 * WebKit underneath, and WebKit has no Web MIDI. Telling someone on an iPad to
 * "use Chrome" sends them to install an app that will not help.
 */
export function midiUnavailableReason() {
  if (midiSupported()) return null
  if (isIOS()) {
    return 'iPhone and iPad cannot connect a piano — no browser on iOS supports MIDI. Everything else here works. For piano input, use a computer with Chrome or Edge.'
  }
  return 'Connecting a piano needs Chrome or Edge.'
}

const NOTE_ON = 0x90
const NOTE_OFF = 0x80
const CONTROL_CHANGE = 0xb0
const ALL_SOUND_OFF = 120
const ALL_NOTES_OFF = 123

// A chord needs three notes. Two is an interval, and committing those would
// fill the answer box with noise every time someone warms up.
const MIN_CHORD_NOTES = 3

/**
 * Start listening.
 *
 * `onNoteOn(note, velocity)` / `onNoteOff(note)` fire per key, so the app can
 * sound what you play through its own piano — necessary if your controller has
 * no speakers of its own.
 * `onHeld(notes)` fires whenever the set of held keys changes.
 * `onCommit(notes)` fires once the hands lift, with the fullest chord that was
 * held during that press — so rolling a chord one note at a time still reports
 * the whole thing rather than a stream of fragments.
 * `onDevices(names)` fires when instruments connect or disconnect.
 */
export async function startMidi({ onHeld, onCommit, onDevices, onNoteOn, onNoteOff } = {}) {
  if (!midiSupported()) {
    throw new Error('This browser has no Web MIDI support. Chrome or Edge will work.')
  }

  let access
  try {
    access = await navigator.requestMIDIAccess({ sysex: false })
  } catch {
    throw new Error('Permission to use MIDI devices was denied.')
  }

  const held = new Set()
  let peak = []
  let stopped = false

  const snapshot = () => [...held].sort((a, b) => a - b)

  const handleMessage = (event) => {
    if (stopped) return
    const [status, data1, data2] = event.data
    const type = status & 0xf0

    if (type === NOTE_ON && data2 > 0) {
      held.add(data1)
      onNoteOn?.(data1, data2 / 127)
    } else if (type === NOTE_OFF || (type === NOTE_ON && data2 === 0)) {
      // Many keyboards send note-on with velocity 0 instead of a note-off.
      held.delete(data1)
      onNoteOff?.(data1)
    } else if (type === CONTROL_CHANGE && (data1 === ALL_NOTES_OFF || data1 === ALL_SOUND_OFF)) {
      for (const note of held) onNoteOff?.(note)
      held.clear()
    } else {
      return // pedals, pitch bend, aftertouch, clock -- not our business
    }

    const notes = snapshot()
    onHeld?.(notes)

    if (notes.length >= MIN_CHORD_NOTES && notes.length >= peak.length) {
      peak = notes
    }
    if (notes.length === 0 && peak.length >= MIN_CHORD_NOTES) {
      onCommit?.(peak)
      peak = []
    }
  }

  const attach = () => {
    const names = []
    for (const input of access.inputs.values()) {
      input.onmidimessage = handleMessage
      names.push(input.name || 'MIDI device')
    }
    onDevices?.(names)
    return names
  }

  // Devices plugged in after we started should just work.
  access.onstatechange = () => {
    if (!stopped) attach()
  }

  const devices = attach()

  return {
    devices,
    stop() {
      stopped = true
      access.onstatechange = null
      for (const input of access.inputs.values()) {
        input.onmidimessage = null
      }
      held.clear()
    },
  }
}
