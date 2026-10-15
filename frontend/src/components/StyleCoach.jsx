import { useEffect, useRef, useState } from 'react'
import { byDifficulty, diatonicTriad, spellScale } from '../keys.js'
import { analysePerformance } from '../style.js'
import { midiUnavailableReason } from '../midi.js'

const PROGRESSIONS = [
  { id: '1564', label: '1 - 5 - 6 - 4', degrees: [0, 4, 5, 3] },
  { id: '6415', label: '6 - 4 - 1 - 5', degrees: [5, 3, 0, 4] },
  { id: '1451', label: '1 - 4 - 5 - 1', degrees: [0, 3, 4, 0] },
]

const NUMERALS = ['1', '2', '3', '4', '5', '6', '7']

/**
 * Play a progression; get told what would make it sound better.
 *
 * Every tip comes from a number measured in the MIDI, so it can say "your
 * chords land dead flat" rather than generic advice that may not apply.
 */
export default function StyleCoach({ midi }) {
  const [keyIndex, setKeyIndex] = useState(0)
  const [prog, setProg] = useState(PROGRESSIONS[0])
  const [recording, setRecording] = useState(false)
  const [count, setCount] = useState(0)
  const [result, setResult] = useState(null)

  const keys = byDifficulty('major')
  const key = keys[keyIndex]
  const names = spellScale(key)

  const take = useRef({ events: [], startedAt: 0 })

  useEffect(() => {
    if (!midi?.onNote) return undefined
    midi.onNote((note, velocity = 0.7) => {
      if (!take.current.recording) return
      take.current.events.push({
        note,
        velocity,
        time: (performance.now() - take.current.startedAt) / 1000,
        duration: 0,
      })
      setCount(take.current.events.length)
    })
    return () => midi.onNote(null)
  }, [midi])

  const start = () => {
    take.current = { events: [], startedAt: performance.now(), recording: true }
    setCount(0)
    setResult(null)
    setRecording(true)
  }

  const stop = () => {
    take.current.recording = false
    setRecording(false)
    setResult(analysePerformance(take.current.events))
  }

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
              result.tips.map((tip) => (
                <div className="coach-tip" key={tip.id}>
                  <strong>{tip.title}</strong>
                  <p>{tip.detail}</p>
                </div>
              ))
            )}

            <p className="coach-stats">
              {result.stats.chords} chords over {result.stats.seconds.toFixed(0)}s · loudest to
              quietest {Math.round(result.stats.dynamicRange * 100)}%
              {result.stats.usesLeftHand ? ' · left hand in use' : ' · right hand only'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
