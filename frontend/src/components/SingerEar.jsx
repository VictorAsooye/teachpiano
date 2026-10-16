import { useEffect, useRef, useState } from 'react'
import { KEYS, compareKeys, scalePitchClasses, spellScale } from '../keys.js'
import { noteLabel } from '../guess.js'
import { stopAll } from '../player.js'
import ClipPlayer from './ClipPlayer.jsx'
import LessonPiano from './LessonPiano.jsx'
import Keyboard from './Keyboard.jsx'
import CLIPS from '../data/earClips.json'

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

const LEVELS = [
  { id: 'easy', label: 'Easy', hint: 'the plainest ones' },
  { id: 'medium', label: 'Medium', hint: 'a fuller band' },
  { id: 'hard', label: 'Hard', hint: 'gospel and big arrangements' },
]

const CLOSENESS = {
  relative: 'Very close — that is the relative key. Same seven notes, different home.',
  parallel: 'Right note, wrong flavour. You found the home note but not the mood.',
  neighbour: 'Close — next door on the circle of fifths.',
  near: 'Not far off.',
  far: 'A long way off.',
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]

/**
 * YouTube titles usually carry the artist already ("Way Maker - Sinach"), so
 * printing the channel after that reads as a stutter.
 */
function songLine(clip) {
  const artist = (clip.artist || '').trim()
  if (!artist) return clip.title
  const title = clip.title.trim()
  if (title.toLowerCase().includes(artist.toLowerCase())) return title
  return `${title} · ${artist}`
}

/**
 * Work out what key a singer is in.
 *
 * This is the thing the whole site is for. A cadence drill teaches you to find
 * a tonic in a tidy four-chord example; a real singer over a real band, with a
 * voice sliding between notes and a mix that buries the bass, is the job. So
 * the clips are real recordings, played through YouTube's own player.
 *
 * Every key in the list was measured by the decoder rather than typed in from
 * memory, and the clip window is chosen to sit inside one key, so a song that
 * lifts a semitone for the last chorus cannot mark you wrong for hearing the
 * first one. See backend/tools/build_ear_set.py.
 */
export default function SingerEar({ midi }) {
  const [level, setLevel] = useState(LEVELS[0])
  const [clip, setClip] = useState(null)
  const [guess, setGuess] = useState({ pc: null, mode: 'major' })
  const [answer, setAnswer] = useState(null)
  const [heard, setHeard] = useState(null)
  const [asked, setAsked] = useState(0)
  const [right, setRight] = useState(0)
  const [seen, setSeen] = useState([])

  const state = useRef({ clip: null, answer: null })
  state.current = { clip, answer }

  const pool = CLIPS.filter((c) => c.level === level.id)

  const nextRound = () => {
    stopAll()
    // Work through the level before repeating anything, or a short list keeps
    // asking the same two songs.
    const unseen = pool.filter((c) => !seen.includes(c.id))
    const next = pick(unseen.length ? unseen : pool)
    setSeen(unseen.length ? [...seen, next.id] : [next.id])
    setClip(next)
    setGuess({ pc: null, mode: 'major' })
    setAnswer(null)
    setHeard(null)
  }

  const lockIn = () => {
    const s = state.current
    if (!s.clip || guess.pc === null || s.answer !== null) return
    const target = KEYS.find((k) => k.pc === s.clip.tonic && k.mode === s.clip.mode)
    if (!target) return
    const correct = guess.pc === target.pc && guess.mode === target.mode
    setAnswer({
      ...guess,
      correct,
      target,
      comparison: compareKeys({ pc: guess.pc, mode: guess.mode }, target),
    })
    setAsked((n) => n + 1)
    if (correct) setRight((n) => n + 1)
  }

  // Playing a note must not submit it: finding the tonic means hunting around
  // until something sounds like home, and a first touch that counted as the
  // answer would make hunting impossible.
  useEffect(() => {
    if (!midi?.onNote) return undefined
    midi.onNote((note) => {
      if (state.current.answer === null) setHeard(note % 12)
    })
    return () => midi.onNote(null)
  }, [midi])

  useEffect(() => () => stopAll(), [])

  if (!CLIPS.length) {
    return (
      <div className="trainer-card">
        <p className="trainer-tip">
          No singer clips are built yet. Run{' '}
          <code>backend\.venv\Scripts\python.exe backend\tools\build_ear_set.py</code> to make
          them.
        </p>
      </div>
    )
  }

  const target = answer?.target
  const useFlats = target ? target.sig < 0 : false

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
                stopAll()
                setClip(null)
                setAnswer(null)
                setSeen([])
              }}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
        {asked > 0 && (
          <span className="trainer-counter">
            {right}/{asked}
          </span>
        )}
      </div>

      <div className="trainer-card">
        {!clip && (
          <>
            <h3 className="trainer-key">What key is the singer in?</h3>
            {pool.length === 0 ? (
              <p className="trainer-tip">
                Nothing at this level yet — try another, or add songs with
                build_ear_set.py.
              </p>
            ) : (
              <>
                <p className="guess-hint">
                  A clip plays. Hunt for the note that sounds like home, then say which key it
                  is. {pool.length} {pool.length === 1 ? 'song' : 'songs'} on{' '}
                  {level.label.toLowerCase()}.
                </p>
                <button type="button" className="check" onClick={nextRound}>
                  Play the first one
                </button>
              </>
            )}
          </>
        )}

        {clip && (
          <>
            <h3 className="trainer-key">{answer ? clip.key : 'What key is the singer in?'}</h3>

            <ClipPlayer videoId={clip.id} start={clip.start} length={clip.length} />

            {!answer && (
              <>
                <p className="guess-hint hunt-hint">
                  Hunt on this keyboard while it plays — most notes will sound wrong, one will
                  sound like it arrived.
                </p>
                <LessonPiano span={[60, 84]} letters />

                {heard !== null && (
                  <p className="guess-hint">
                    Last note you played: <strong>{noteLabel(heard, false)}</strong>
                  </p>
                )}

                <span className="section-label">Your answer</span>
                <div className="root-grid ear-roots">
                  {ROOTS.map((root) => (
                    <button
                      key={root.pc}
                      type="button"
                      className={guess.pc === root.pc ? 'root-key picked' : 'root-key'}
                      onClick={() => setGuess((g) => ({ ...g, pc: root.pc }))}
                    >
                      {root.label}
                    </button>
                  ))}
                </div>

                <div className="segmented singer-mode" role="group" aria-label="Major or minor">
                  {['major', 'minor'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={guess.mode === option ? 'segment selected' : 'segment'}
                      onClick={() => setGuess((g) => ({ ...g, mode: option }))}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="check"
                  disabled={guess.pc === null}
                  onClick={lockIn}
                >
                  {guess.pc === null
                    ? 'Pick a key first'
                    : `Lock in ${ROOTS.find((r) => r.pc === guess.pc).label} ${guess.mode}`}
                </button>
              </>
            )}

            {answer && (
              <>
                <Keyboard highlight={[target.pc]} shade={scalePitchClasses(target)} />
                <p className="keyboard-caption">
                  Blue is home. The dots are the rest of {target.name}.
                </p>

                <div
                  className={
                    answer.correct
                      ? 'verdict good'
                      : ['relative', 'parallel', 'neighbour'].includes(answer.comparison.verdict)
                        ? 'verdict close'
                        : 'verdict bad'
                  }
                >
                  <p className="verdict-main">
                    {answer.correct ? (
                      <strong>Yes — {clip.key}.</strong>
                    ) : (
                      <>
                        <strong>It was {clip.key}.</strong>{' '}
                        {CLOSENESS[answer.comparison.verdict]}
                      </>
                    )}
                  </p>
                  {!answer.correct && (
                    <p className="verdict-note">
                      You said {ROOTS.find((r) => r.pc === answer.pc).label} {answer.mode} — that
                      shares <strong>{answer.comparison.shared} of 7</strong> notes with{' '}
                      {target.name}.
                    </p>
                  )}
                </div>

                <div className="why">
                  <span className="section-label">The song</span>
                  <p className="verdict-note">
                    <strong>{songLine(clip)}</strong>
                  </p>
                  <p className="verdict-note">
                    {target.name} is {spellScale(target).join(' ')}. If you are playing along,
                    find the {noteLabel(target.pc, useFlats)} and the rest follows.
                  </p>
                  {clip.modulates && (
                    <p className="verdict-note">
                      This song changes key later on — the clip is taken from a stretch that
                      stays in one.
                    </p>
                  )}
                  <a
                    className="video-fallback"
                    href={`https://www.youtube.com/watch?v=${clip.id}&t=${Math.floor(clip.start)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Hear the whole song on YouTube ↗
                  </a>
                </div>

                <button type="button" className="check" onClick={nextRound}>
                  Next singer →
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
