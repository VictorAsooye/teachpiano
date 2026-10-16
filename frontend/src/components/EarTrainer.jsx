import { useEffect, useRef, useState } from 'react'
import {
  KEYS,
  cadence,
  compareKeys,
  diatonicTriad,
  scalePitchClasses,
  spellScale,
} from '../keys.js'
import { noteLabel } from '../guess.js'
import { playMidiSequence, stopAll } from '../player.js'
import Keyboard from './Keyboard.jsx'
import SingerEar from './SingerEar.jsx'

const ROOTS = [
  { pc: 0, label: 'C' },
  { pc: 1, label: 'C♯' },
  { pc: 2, label: 'D' },
  { pc: 3, label: 'E♭' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 6, label: 'F♯' },
  { pc: 7, label: 'G' },
  { pc: 8, label: 'A♭' },
  { pc: 9, label: 'A' },
  { pc: 10, label: 'B♭' },
  { pc: 11, label: 'B' },
]

// Start with three keys, not twelve. Twelve options on day one is a coin flip
// with extra steps, and you learn nothing from guessing.
const LEVELS = [
  { id: 'easy', label: 'Easy', hint: '3 keys', roots: [0, 5, 7] },
  { id: 'medium', label: 'Medium', hint: 'white notes', roots: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'hard', label: 'All keys', hint: 'all 12', roots: ROOTS.map((r) => r.pc) },
]

const pick = (list) => list[Math.floor(Math.random() * list.length)]

const CLOSENESS = {
  relative: 'Very close — that is the relative key. Same seven notes, different home.',
  parallel: 'Right note, wrong flavour. You heard the tonic.',
  neighbour: 'Close — next door on the circle of fifths.',
  near: 'Not far off.',
  far: 'A long way off.',
}

/** The one or two notes that actually separate two keys. */
function differenceText(comparison, useFlats) {
  const swapped = comparison.extra.map((pc) => noteLabel(pc, useFlats))
  const wanted = comparison.missing.map((pc) => noteLabel(pc, useFlats))
  if (!swapped.length || !wanted.length) return null
  if (swapped.length <= 2) {
    return `You had ${swapped.join(' and ')} where it wanted ${wanted.join(' and ')}.`
  }
  return null
}

/**
 * Find the tonic by ear.
 *
 * This is the honest version of "hear the key". Naming a key from nothing is
 * absolute pitch, which adults mostly cannot learn. Hearing where a passage
 * wants to come to rest, and finding that note, is relative pitch — it is
 * learnable, and it is the thing you actually do when working out a singer's
 * key. So the drill plays a cadence first: that gives your ear a home to find.
 */
function CadenceEar({ midi }) {
  const [level, setLevel] = useState(LEVELS[0])
  const [mode, setMode] = useState('major')
  const [target, setTarget] = useState(null)
  const [answer, setAnswer] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(0)
  const [heard, setHeard] = useState(null)
  const [asked, setAsked] = useState(0)
  const [right, setRight] = useState(0)

  const state = useRef({ target: null, answer: null })
  state.current = { target, answer }

  const playCadence = async (key) => {
    setPlaying(true)
    await playMidiSequence(cadence(key, 3), {
      noteLength: 0.62,
      onEnd: () => setPlaying(false),
    })
  }

  const nextRound = async () => {
    const pool = KEYS.filter((k) => k.mode === mode && level.roots.includes(k.pc))
    const key = pick(pool)
    setTarget(key)
    setAnswer(null)
    setHeard(null)
    await playCadence(key)
  }

  const submit = (pc) => {
    const s = state.current
    if (!s.target || s.answer !== null) return
    const correct = pc === s.target.pc
    const comparison = compareKeys({ pc, mode: s.target.mode }, s.target)
    setAnswer({
      pc,
      correct,
      comparison,
      close: !correct && ['relative', 'parallel', 'neighbour'].includes(comparison.verdict),
    })
    setAsked((n) => n + 1)
    if (correct) {
      setRight((n) => n + 1)
      setStreak((n) => {
        const next = n + 1
        setBest((b) => Math.max(b, next))
        return next
      })
    } else {
      setStreak(0)
    }
  }

  // Playing a note must NOT submit it. Finding the tonic means hunting around
  // the keyboard until something sounds like home — if the first key you touch
  // counted as your answer, the hunting would be impossible and every round
  // would be spent by accident. So playing only shows what you played, and you
  // commit deliberately.
  useEffect(() => {
    if (!midi?.onNote) return undefined
    midi.onNote((note) => {
      if (state.current.answer === null) setHeard(note % 12)
    })
    return () => midi.onNote(null)
  }, [midi])

  useEffect(() => () => stopAll(), [])

  const reset = () => {
    stopAll()
    setPlaying(false)
    setTarget(null)
    setAnswer(null)
    setHeard(null)
    setStreak(0)
    setAsked(0)
    setRight(0)
  }

  // I - IV - V - I, named in the key being heard. The quality is read off the
  // triad rather than assumed: in natural minor the v is minor too, which a
  // hardcoded list of degrees gets wrong.
  const degreeNames = target ? spellScale(target) : []
  const cadenceNames = target
    ? [0, 3, 4, 0].map((d) => {
        const triad = diatonicTriad(target, d)
        const isMinor = triad[1] - triad[0] === 3
        return degreeNames[d] + (isMinor ? 'm' : '')
      })
    : []

  return (
    <>
      <div className="trainer-head">
        <div className="segmented" role="group" aria-label="Difficulty">
          {LEVELS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={level.id === option.id ? 'segment selected' : 'segment'}
              onClick={() => {
                setLevel(option)
                reset()
              }}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Major or minor">
          {['major', 'minor'].map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? 'segment selected' : 'segment'}
              onClick={() => {
                setMode(option)
                reset()
              }}
            >
              {option}
            </button>
          ))}
        </div>
        {asked > 0 && (
          <span className="trainer-counter">
            {right}/{asked} · streak {streak}
            {best > 1 ? ` · best ${best}` : ''}
          </span>
        )}
      </div>

      <div className="trainer-card">
        {!target && (
          <>
            <h3 className="trainer-key">Find the home note</h3>
            <p className="guess-hint">
              Four chords play. They settle onto one note. Name that note.
            </p>
            <button type="button" className="check" onClick={nextRound}>
              Play the first one
            </button>
          </>
        )}

        {target && (
          <>
            <h3 className="trainer-key">{answer ? target.name : 'Which note is home?'}</h3>

            <div className="controls">
              <button
                type="button"
                className={playing ? 'playing' : 'primary'}
                onClick={playing ? () => { stopAll(); setPlaying(false) } : () => playCadence(target)}
              >
                <span className="glyph">{playing ? '■' : '▶'}</span>
                {playing ? 'Stop' : 'Hear it again'}
              </button>
              {answer && (
                <button type="button" onClick={nextRound}>
                  Next one →
                </button>
              )}
            </div>

            <div className="root-grid ear-roots">
              {ROOTS.map((root) => {
                const inPool = level.roots.includes(root.pc)
                let className = 'root-key'
                if (answer) {
                  if (root.pc === target.pc) className += ' correct'
                  else if (root.pc === answer.pc) className += ' incorrect'
                }
                if (!inPool) className += ' dim'
                return (
                  <button
                    key={root.pc}
                    type="button"
                    className={className}
                    disabled={!!answer || !inPool}
                    onClick={() => submit(root.pc)}
                  >
                    {root.label}
                  </button>
                )
              })}
            </div>

            {answer && (
              <>
                <Keyboard highlight={[target.pc]} shade={scalePitchClasses(target)} />
                <p className="keyboard-caption">
                  Blue is home. The dots are the rest of {target.name}.
                </p>
                <div className={answer.correct ? 'verdict good' : answer.close ? 'verdict close' : 'verdict bad'}>
                  <p className="verdict-main">
                    {answer.correct ? (
                      <>
                        <strong>Yes — {target.tonic}.</strong>{' '}
                        {streak > 1 ? `That's ${streak} in a row.` : ''}
                      </>
                    ) : (
                      <>
                        <strong>It was {target.tonic}.</strong>{' '}
                        {CLOSENESS[answer.comparison.verdict]}
                      </>
                    )}
                  </p>
                  {!answer.correct && (
                    <p className="verdict-note">
                      You said {ROOTS.find((r) => r.pc === answer.pc)?.label} — that shares{' '}
                      <strong>{answer.comparison.shared} of 7</strong> notes with {target.name}.{' '}
                      {differenceText(answer.comparison, target.sig < 0)}
                    </p>
                  )}
                </div>

                {/* Why it was that key, not just what it was. */}
                <div className="why">
                  <span className="section-label">Why</span>
                  <p className="verdict-note">
                    You heard <strong>{cadenceNames.join(' · ')}</strong> — the 1, 4, 5 and 1
                    chords of {target.name}. A song comes to rest on its 1 chord, and that is
                    the one it ended on.
                  </p>
                  <p className="verdict-note">
                    {target.name} is {spellScale(target).join(' ')}. Every chord you heard was
                    built from those notes.
                  </p>
                </div>
              </>
            )}

            {!answer && midi?.supported && midi.status !== 'on' && (
              <p className="trainer-tip">
                Connect your piano in <strong>Learn keys</strong> to hunt on the keys instead.
              </p>
            )}
            {!answer && midi?.status === 'on' && heard === null && (
              <p className="trainer-tip">
                Play around until a note sounds like home. Nothing counts until you lock it in.
              </p>
            )}
            {!answer && midi?.status === 'on' && heard !== null && (
              <div className="lock-row">
                <span className="lock-heard">
                  You&apos;re on <strong>{ROOTS.find((r) => r.pc === heard)?.label}</strong>
                </span>
                <button type="button" className="check" onClick={() => submit(heard)}>
                  Lock it in
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

const DRILLS = [
  { id: 'singers', label: 'Real singers', hint: 'Find the key of a recording' },
  { id: 'chords', label: 'Four chords', hint: 'The tidy version, to warm up on' },
]

/**
 * Two ways to practise the same skill.
 *
 * The cadence drill is the clean-room version: four chords, no distractions,
 * useful when you are starting out. Real singers is the job -- a voice over a
 * band, where the tonic has to be hunted for rather than handed to you. It
 * leads, because that is what anyone is here to get better at.
 */
export default function EarTrainer({ midi }) {
  const [drill, setDrill] = useState(DRILLS[0].id)

  return (
    <div className="trainer">
      <div className="segmented drill-switch" role="group" aria-label="Which drill">
        {DRILLS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={drill === option.id ? 'segment selected' : 'segment'}
            onClick={() => setDrill(option.id)}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>

      {drill === 'singers' ? <SingerEar midi={midi} /> : <CadenceEar midi={midi} />}
    </div>
  )
}
