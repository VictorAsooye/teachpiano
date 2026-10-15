import { useCallback, useEffect, useRef, useState } from 'react'
import { identifyChord } from './guess.js'
import { midiSupported, startMidi } from './midi.js'
import { initAudio, instrumentReady, midiNoteOff, midiNoteOn } from './player.js'

/**
 * One MIDI connection for the whole app.
 *
 * It lives above the guess panels so the piano stays connected as you move from
 * naming the key to naming the chords — reconnecting per stage would drop the
 * device mid-session and re-prompt for permission.
 */
export default function useMidi({ useFlats = false } = {}) {
  const [status, setStatus] = useState('off') // off | connecting | on | error
  const [error, setError] = useState(null)
  const [devices, setDevices] = useState([])
  const [held, setHeld] = useState([])
  const [sound, setSound] = useState(true)
  const [ready, setReady] = useState(false)

  const session = useRef(null)
  // Each stage wants something different done with a finished chord, but the
  // connection must outlive the stage, so the handler goes through a ref
  // instead of being baked into the session.
  const commitHandler = useRef(null)
  // Drills need every keypress, not just finished chords; the style coach
  // also needs how hard it was hit.
  const noteHandler = useRef(null)
  const soundOn = useRef(sound)
  soundOn.current = sound

  useEffect(() => () => session.current?.stop(), [])

  const connect = useCallback(async () => {
    if (session.current) return
    setStatus('connecting')
    setError(null)
    try {
      // Load the piano now, while connecting. The click that got us here is the
      // user gesture the browser wants, and warming up here means the first key
      // you press sounds immediately instead of waiting on 22 sample downloads.
      await initAudio()
      const started = await startMidi({
        onNoteOn: (note, velocity) => {
          if (soundOn.current) midiNoteOn(note, Math.max(0.25, velocity))
          noteHandler.current?.(note, velocity)
        },
        onNoteOff: (note) => {
          if (soundOn.current) midiNoteOff(note)
        },
        onHeld: setHeld,
        onCommit: (notes) => commitHandler.current?.(notes),
        onDevices: setDevices,
      })
      session.current = started
      setDevices(started.devices)
      setReady(instrumentReady())
      setStatus('on')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  const onCommit = useCallback((handler) => {
    commitHandler.current = handler
  }, [])

  const onNote = useCallback((handler) => {
    noteHandler.current = handler
  }, [])

  const chord = identifyChord(held, { useFlats })

  return {
    supported: midiSupported(),
    status,
    error,
    devices,
    held,
    chord,
    connect,
    onCommit,
    onNote,
    sound,
    setSound,
    ready,
  }
}
