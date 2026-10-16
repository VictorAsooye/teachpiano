import { useEffect, useRef, useState } from 'react'
import { playMidiNote, playMidiChord, playMidiSequence, stopAll } from '../player.js'

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const LETTERS = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' }

const pcOf = (midi) => ((midi % 12) + 12) % 12
const isWhite = (midi) => WHITE_PCS.includes(pcOf(midi))

/** The two black-key clusters: C#-D# is a pair, F#-G#-A# is a trio. */
const CLUSTER = { 1: 'pair', 3: 'pair', 6: 'trio', 8: 'trio', 10: 'trio' }

/**
 * A labelled, playable piano diagram.
 *
 * The plain `Keyboard` shows what the app is doing right now. This one is for
 * being read: keys carry names and numbers, you can press them to hear them,
 * and the thing a lesson wants you to notice is coloured differently from the
 * notes that merely surround it.
 *
 * `marks` is the whole interface — a list of { midi, text, tone }. Everything
 * else on the keyboard stays plain, so whatever is marked is what the eye
 * goes to.
 */
export default function LessonPiano({
  span = [60, 84],
  marks = [],
  letters = false,
  clusters = false,
  play = null,
  playAs = 'scale',
  playLabel = 'Hear it',
  size = 'full',
}) {
  const [from, to] = span
  const [lit, setLit] = useState([])
  const [playing, setPlaying] = useState(false)
  const [tapped, setTapped] = useState(null)
  const timer = useRef(null)

  // A run left playing when the lesson is collapsed would keep sounding over
  // whatever you opened next.
  useEffect(() => () => clearTimeout(timer.current), [])

  const notes = []
  for (let m = from; m <= to; m += 1) notes.push(m)
  const whites = notes.filter(isWhite)
  const blacks = notes.filter((m) => !isWhite(m))
  const unit = 100 / whites.length
  const blackWidth = unit * 0.6

  const markOf = (midi) => marks.find((mark) => mark.midi === midi)
  const leftOf = (midi) => (whites.indexOf(midi - 1) + 1) * unit - blackWidth / 2

  const tap = (midi) => {
    playMidiNote(midi)
    setTapped(midi)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setTapped(null), 260)
  }

  const hear = async () => {
    if (playing) {
      stopAll()
      setPlaying(false)
      setLit([])
      return
    }
    setPlaying(true)
    if (playAs === 'chord') {
      setLit(play)
      await playMidiChord(play)
      timer.current = setTimeout(() => {
        setPlaying(false)
        setLit([])
      }, 1500)
      return
    }
    await playMidiSequence(play, {
      noteLength: playAs === 'chords' ? 0.95 : 0.42,
      onNote: (i) => setLit([play[i]].flat()),
      onEnd: () => {
        setPlaying(false)
        setLit([])
      },
    })
  }

  // Brackets over each run of black keys, for "they come in 2s and 3s".
  const brackets = []
  if (clusters) {
    let run = []
    const flush = () => {
      if (!run.length) return
      const left = leftOf(run[0])
      const right = leftOf(run[run.length - 1]) + blackWidth
      brackets.push({ left, width: right - left, count: run.length, key: run[0] })
      run = []
    }
    blacks.forEach((midi, i) => {
      const prev = blacks[i - 1]
      const sameRun =
        prev !== undefined && midi - prev <= 2 && CLUSTER[pcOf(midi)] === CLUSTER[pcOf(prev)]
      if (!sameRun) flush()
      run.push(midi)
    })
    flush()
  }

  const keyClass = (midi, white) => {
    const mark = markOf(midi)
    return [
      'lk-key',
      white ? 'lk-white' : 'lk-black',
      mark ? `lk-marked lk-${mark.tone || 'root'}` : '',
      lit.includes(midi) ? 'lk-lit' : '',
      tapped === midi ? 'lk-tapped' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  const label = (midi) => {
    const mark = markOf(midi)
    if (mark?.text) return mark.text
    if (letters && isWhite(midi)) return LETTERS[pcOf(midi)]
    return null
  }

  return (
    <div className={`lesson-piano${size === 'mini' ? ' mini' : ''}`}>
      <div className="lk-board">
        {clusters && (
          <div className="lk-brackets">
            {brackets.map((b) => (
              <span
                key={b.key}
                className="lk-bracket"
                style={{ left: `${b.left}%`, width: `${b.width}%` }}
              >
                {b.count}
              </span>
            ))}
          </div>
        )}

        <div className="lk-keys">
          {whites.map((midi) => (
            <button
              type="button"
              key={midi}
              className={keyClass(midi, true)}
              onClick={() => tap(midi)}
              aria-label={`${LETTERS[pcOf(midi)]}${Math.floor(midi / 12) - 1}`}
            >
              {label(midi) && <span className="lk-label">{label(midi)}</span>}
            </button>
          ))}

          {blacks.map((midi) => (
            <button
              type="button"
              key={midi}
              className={keyClass(midi, false)}
              style={{ left: `${leftOf(midi)}%`, width: `${blackWidth}%` }}
              onClick={() => tap(midi)}
              aria-label={`${LETTERS[pcOf(midi - 1)]} sharp`}
            >
              {label(midi) && <span className="lk-label">{label(midi)}</span>}
            </button>
          ))}
        </div>
      </div>

      {play && play.length > 0 && (
        <button type="button" className="lk-play" onClick={hear}>
          {playing ? 'Stop' : playLabel}
        </button>
      )}
    </div>
  )
}
