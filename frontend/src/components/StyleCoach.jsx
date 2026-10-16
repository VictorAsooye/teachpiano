import { useEffect, useRef, useState } from 'react'
import { byDifficulty, diatonicTriad, spellScale } from '../keys.js'
import { analysePerformance, compareTakes } from '../style.js'
import { midiUnavailableReason } from '../midi.js'
import StyleStrip from './StyleStrip.jsx'
import LessonPiano from './LessonPiano.jsx'

const PROGRESSIONS = [
  { id: '1564', label: '1 - 5 - 6 - 4', degrees: [0, 4, 5, 3] },
  { id: '6415', label: '6 - 4 - 1 - 5', degrees: [5, 3, 0, 4] },
  { id: '1451', label: '1 - 4 - 5 - 1', degrees: [0, 3, 4, 0] },
]

const NUMERALS = ['1', '2', '3', '4', '5', '6', '7']
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const name = (midi) => NAMES[((midi % 12) + 12) % 12]

/** A keyboard wide enough to hold both voicings, rounded out to whole octaves. */
function spanFor(notes) {
  const low = Math.min(...notes)
  const high = Math.max(...notes)
  return [Math.min(low, high - 12) - 2, Math.max(high, low + 12) + 2]
}

/**
 * Show the worst chord change of the take beside the voicing that would have
 * avoided it.
 *
 * Naming inversions teaches nobody. Two keyboards with your own notes on them,
 * one travelling half as far as the other, teaches it in a glance.
 */
function InversionFix({ worst }) {
  const span = spanFor([...worst.from, ...worst.to, ...worst.better])
  const marks = (notes, tone) => notes.map((n) => ({ midi: n, text: name(n), tone }))

  return (
    <div className="tip-visual">
      <div className="tip-visual-row">
        <span className="tip-visual-label">What you played</span>
        {/* The chord being moved TO is listed first: a key held by both
            voicings takes the colour of whichever mark comes first, and the
            one worth looking at is where you landed, not where you were. */}
        <LessonPiano
          size="mini"
          span={span}
          marks={[...marks(worst.to, 'accent'), ...marks(worst.from, 'soft')]}
          play={worst.to}
          playAs="chord"
          playLabel="Hear the jump"
        />
        <span className="tip-visual-note">{worst.distance} semitones to reach it</span>
      </div>

      <div className="tip-visual-row">
        <span className="tip-visual-label">Same chord, nearest shape</span>
        <LessonPiano
          size="mini"
          span={span}
          marks={[...marks(worst.better, 'root'), ...marks(worst.from, 'soft')]}
          play={worst.better}
          playAs="chord"
          playLabel="Hear the inversion"
        />
        <span className="tip-visual-note">
          {worst.better.map(name).join(' ')} — the same notes, right under your hand
        </span>
      </div>
    </div>
  )
}

/**
 * Play a progression; get told what would make it sound better.
 *
 * Every tip comes from a number measured in the MIDI and quotes that number
 * back, so it reads as "your chords are 9% apart" rather than as advice that
 * might apply to anyone.
 */
export default function StyleCoach({ midi }) {
  const [keyIndex, setKeyIndex] = useState(0)
  const [prog, setProg] = useState(PROGRESSIONS[0])
  const [recording, setRecording] = useState(false)
  const [count, setCount] = useState(0)
  const [result, setResult] = useState(null)
  const [previous, setPrevious] = useState(null)

  const keys = byDifficulty('major')
  const key = keys[keyIndex]
  const names = spellScale(key)

  const take = useRef({ events: [], startedAt: 0, open: new Map() })

  useEffect(() => {
    if (!midi?.onNote) return undefined

    midi.onNote((note, velocity = 0.7) => {
      if (!take.current.recording) return
      const event = {
        note,
        velocity,
        time: (performance.now() - take.current.startedAt) / 1000,
        duration: 0,
      }
      take.current.events.push(event)
      // Held open until the release lands, so how long you hold a chord can be
      // measured rather than assumed.
      take.current.open.set(note, event)
      setCount(take.current.events.length)
    })

    midi.onNoteOff?.((note) => {
      if (!take.current.recording) return
      const event = take.current.open.get(note)
      if (!event) return
      event.duration = (performance.now() - take.current.startedAt) / 1000 - event.time
      take.current.open.delete(note)
    })

    return () => {
      midi.onNote(null)
      midi.onNoteOff?.(null)
    }
  }, [midi])

  const start = () => {
    take.current = { events: [], startedAt: performance.now(), recording: true, open: new Map() }
    setCount(0)
    setResult(null)
    setRecording(true)
  }

  const stop = () => {
    take.current.recording = false
    setRecording(false)
    // Anything still down when you stopped was held at least this long.
    const now = (performance.now() - take.current.startedAt) / 1000
    take.current.open.forEach((event) => {
      if (!event.duration) event.duration = Math.max(0, now - event.time)
    })
    const analysis = analysePerformance(take.current.events)
    setPrevious(result?.stats || null)
    setResult(analysis)
  }

  const change = result?.enough ? compareTakes(result.stats, previous) : null

  return (
    <div className="trainer">
      <div className="trainer-card">
        <span className="section-label">Play this</span>

        <div className="coach-pick">
          <select value={prog.id} onChange={(e) => setProg(PROGRESSIONS.find((p) => p.id === e.target.value))}>
            {PROGRESSIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <select value={keyIndex} onChange={(e) => setKeyIndex(Number(e.target.value))}>
            {keys.map((k, i) => (
              <option key={k.name} value={i}>{k.name}</option>
            ))}
          </select>
        </div>

        <div className="coach-chords">
          {prog.degrees.map((degree, i) => {
            const triad = diatonicTriad(key, degree, 3)
            const spelled = [0, 2, 4].map((o) => names[(degree + o) % 7])
            return (
              <div className="coach-chord" key={i}>
                <span className="coach-num">{NUMERALS[degree]}</span>
                <strong>{spelled.join(' ')}</strong>
                <span className="coach-midi">{triad.length} notes</span>
              </div>
            )
          })}
        </div>
        <p className="keyboard-caption">Loop it a few times. Play it how you would on a Sunday.</p>
      </div>

      <div className="trainer-card">
        {!midi?.supported && (
          <p className="midi-unsupported">{midiUnavailableReason()}</p>
        )}

        {midi?.supported && midi.status !== 'on' && (
          <>
            <p className="guess-hint">Connect your piano and it will listen while you play.</p>
            <button type="button" className="midi-connect" onClick={midi.connect}>
              {midi.status === 'connecting' ? 'Connecting…' : '🎹 Use my piano'}
            </button>
            {midi.status === 'error' && <span className="midi-error">{midi.error}</span>}
          </>
        )}

        {midi?.supported && midi.status === 'on' && (
          <>
            {!recording && (
              <button type="button" className="check" onClick={start}>
                {result ? 'Try again' : 'Start — then play'}
              </button>
            )}
            {recording && (
              <>
                <p className="coach-live">
                  <span className="rec-dot" /> Listening · {count} notes
                </p>
                <button type="button" className="check" onClick={stop}>
                  Done
                </button>
              </>
            )}
          </>
        )}

        {result && !result.enough && (
          <p className="trainer-tip">Not enough to go on — play the progression through a couple of times.</p>
        )}

        {result?.enough && (
          <div className="coach-result">
            <div className="coach-shown">
              <span className="section-label">What that sounded like</span>
              <StyleStrip
                chords={result.chords}
                seconds={result.stats.seconds}
                highlight={null}
              />
              <p className="keyboard-caption">
                Each bar is a chord — taller means you hit it harder, wider means you held it
                longer. A flat, evenly spaced row is the sound of playing like a machine.
              </p>
            </div>

            {change && (
              <p className="coach-change">Since your last go: {change.join(' · ')}.</p>
            )}

            {result.praise.length > 0 && (
              <div className="verdict good">
                <p className="verdict-main">
                  <strong>Working well:</strong> {result.praise.join(', ')}.
                </p>
              </div>
            )}

            {result.tips.length === 0 ? (
              <p className="trainer-tip">Nothing to fix. Try it in a harder key.</p>
            ) : (
              result.tips.slice(0, 3).map((tip) => (
                <div className="coach-tip" key={tip.id}>
                  <strong>{tip.title}</strong>
                  {tip.evidence && <p className="tip-evidence">{tip.evidence}</p>}
                  <p>{tip.detail}</p>
                  {tip.id === 'inversions' && tip.worst && <InversionFix worst={tip.worst} />}
                </div>
              ))
            )}

            {result.tips.length > 3 && (
              <p className="coach-stats">
                {result.tips.length - 3} more to work on — fix these first and they often go away.
              </p>
            )}

            <p className="coach-stats">
              {result.stats.chords} chords over {result.stats.seconds.toFixed(0)}s ·{' '}
              {result.stats.density.toFixed(1)} a second · loudest to quietest{' '}
              {Math.round(result.stats.dynamicRange * 100)}%
              {result.stats.usesLeftHand ? ' · left hand in use' : ' · right hand only'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
