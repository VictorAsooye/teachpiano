import { useEffect, useRef, useState } from 'react'
import {
  byDifficulty,
  relativeOf,
  scaleMidi,
  scalePitchClasses,
  signatureText,
  spellScale,
} from '../keys.js'
import { playMidiSequence, stopAll } from '../player.js'
import Keyboard from './Keyboard.jsx'
import { midiUnavailableReason } from '../midi.js'

const OCTAVE = 4

/**
 * Learn the 24 keys, one at a time.
 *
 * Shows a key, then asks you to play it. Matching is by pitch class, not by
 * exact note: which octave you play the scale in is not the thing being
 * learned, and failing someone for starting an octave low would just be
 * annoying.
 */
export default function KeyTrainer({ midi }) {
  const [mode, setMode] = useState('major')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [litNote, setLitNote] = useState(-1)

  // Drill state: how far up the scale you have played correctly.
  const [drilling, setDrilling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [wrong, setWrong] = useState(null)
  const [done, setDone] = useState(false)

  const order = byDifficulty(mode)
  const key = order[Math.min(index, order.length - 1)]
  const notes = spellScale(key)
  const pcs = scalePitchClasses(key)
  const midiNotes = scaleMidi(key, OCTAVE)
  const relative = relativeOf(key)

  // The drill reads live state, so it goes through a ref rather than being
  // rebuilt (and re-subscribed) on every keypress.
  const state = useRef({ drilling: false, progress: 0, pcs: [] })
  state.current = { drilling, progress, pcs }

  useEffect(() => {
    if (!midi?.onNote) return undefined
    midi.onNote((note) => {
      const s = state.current
      if (!s.drilling) return
      // The scale is 7 notes then the tonic again on top: 8 steps.
      const expected = s.progress < 7 ? s.pcs[s.progress] : s.pcs[0]
      if (note % 12 === expected) {
        setWrong(null)
        setProgress((p) => {
          const next = p + 1
          if (next >= 8) {
            setDrilling(false)
            setDone(true)
          }
          return next
        })
      } else {
        setWrong(note % 12)
      }
    })
    return () => midi.onNote(null)
  }, [midi])

  const reset = () => {
    setProgress(0)
    setWrong(null)
    setDone(false)
    setDrilling(false)
  }

  const goTo = (nextIndex) => {
    stopAll()
    setPlaying(false)
    setLitNote(-1)
    reset()
    setIndex((nextIndex + order.length) % order.length)
  }

  const hear = async () => {
    setPlaying(true)
    await playMidiSequence(midiNotes, {
      noteLength: 0.42,
      onNote: setLitNote,
      onEnd: () => {
        setPlaying(false)
        setLitNote(-1)
      },
    })
  }

  const stop = () => {
    stopAll()
    setPlaying(false)
    setLitNote(-1)
  }

  // What the keyboard should light up right now.
  const highlight = drilling
    ? [progress < 7 ? pcs[progress] : pcs[0]]
    : playing && litNote >= 0
      ? [midiNotes[litNote] % 12]
      : []

  return (
    <div className="trainer">
      <div className="trainer-head">
        <div className="segmented" role="group" aria-label="Major or minor">
          {['major', 'minor'].map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? 'segment selected' : 'segment'}
              onClick={() => {
                setMode(option)
                goTo(0)
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="trainer-counter">
          Key {index + 1} of {order.length}
        </span>
      </div>

      {/* Ordered easiest-first, so working left to right is a sensible plan. */}
      <div className="key-ladder">
        {order.map((candidate, i) => (
          <button
            key={candidate.name}
            type="button"
            className={i === index ? 'ladder-key on' : 'ladder-key'}
            onClick={() => goTo(i)}
            title={signatureText(candidate)}
          >
            {candidate.tonic}
          </button>
        ))}
      </div>

      <div className="trainer-card">
        <h3 className="trainer-key">{key.name}</h3>
        <p className="trainer-sig">{signatureText(key)}</p>

        <div className="scale-row">
          {notes.map((note, i) => (
            <span
              key={note + i}
              className={
                (drilling && i === progress) || (playing && litNote === i)
                  ? 'scale-note lit'
                  : drilling && i < progress
                    ? 'scale-note got'
                    : 'scale-note'
              }
            >
              {note}
            </span>
          ))}
        </div>

        <Keyboard highlight={highlight} shade={pcs} />
        <p className="keyboard-caption">Blue dots are the {key.name} scale.</p>

        <div className="controls">
          <button type="button" className={playing ? 'playing' : 'primary'} onClick={playing ? stop : hear}>
            <span className="glyph">{playing ? '■' : '▶'}</span>
            {playing ? 'Stop' : 'Hear it'}
          </button>
          <button type="button" onClick={() => goTo(index - 1)}>← Previous</button>
          <button type="button" onClick={() => goTo(index + 1)}>Next key →</button>
        </div>

        {relative && (
          <p className="trainer-tip">
            Same notes as <strong>{relative.name}</strong>. Learn one, get both.
          </p>
        )}
      </div>

      <div className="trainer-card">
        <span className="section-label">Play it yourself</span>
        {!midi?.supported && (
          <p className="midi-unsupported">{midiUnavailableReason()}</p>
        )}

        {midi?.supported && midi.status !== 'on' && (
          <>
            <p className="guess-hint">Connect your piano and it checks every note.</p>
            <button type="button" className="midi-connect" onClick={midi.connect}>
              {midi.status === 'connecting' ? 'Connecting…' : '🎹 Use my piano'}
            </button>
            {midi.status === 'error' && <span className="midi-error">{midi.error}</span>}
          </>
        )}

        {midi?.supported && midi.status === 'on' && (
          <>
            <p className="guess-hint">
              Play {key.name} upwards — 8 notes, ending on {key.tonic}. Any octave.
            </p>

            {!drilling && !done && (
              <button
                type="button"
                className="check"
                onClick={() => {
                  reset()
                  setDrilling(true)
                }}
              >
                Start
              </button>
            )}

            {drilling && (
              <>
                <div className="drill-track">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < progress ? 'drill-step got' : i === progress ? 'drill-step now' : 'drill-step'
                      }
                    />
                  ))}
                </div>
                <p className="drill-prompt">
                  Next note: <strong>{progress < 7 ? notes[progress] : notes[0]}</strong>
                  {progress === 7 && ' (the tonic again, an octave up)'}
                </p>
                {wrong !== null && (
                  <p className="drill-wrong">
                    Not that one — try {progress < 7 ? notes[progress] : notes[0]}.
                  </p>
                )}
                <button type="button" className="skip standalone" onClick={reset}>
                  Start over
                </button>
              </>
            )}

            {done && (
              <div className="verdict good">
                <p className="verdict-main">
                  <strong>That&apos;s {key.name}.</strong> All eight notes, in order.
                </p>
                <button type="button" className="reveal" onClick={() => goTo(index + 1)}>
                  Next key: {order[(index + 1) % order.length].name} →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
