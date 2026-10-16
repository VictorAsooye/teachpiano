import { useState } from 'react'
import LessonPiano from './LessonPiano.jsx'
import { playMidiSequence, stopAll } from '../player.js'

/**
 * The picture that goes with a lesson.
 *
 * Four shapes cover the whole curriculum: a keyboard, a row of keyboards for
 * comparing shapes side by side, bars for loudness, and a beat grid for
 * rhythm. Anything a lesson wants to show is one of those, which keeps the
 * lesson data declarative — no level has to know any React.
 */
export default function LessonVisual({ visual }) {
  if (!visual) return null

  if (visual.kind === 'row') return <PianoRow visual={visual} />
  if (visual.kind === 'bars') return <Bars visual={visual} />
  if (visual.kind === 'beats') return <Beats visual={visual} />

  return (
    <figure className="lesson-visual">
      <LessonPiano {...visual} />
      {visual.caption && <figcaption className="lk-caption">{visual.caption}</figcaption>}
    </figure>
  )
}

/**
 * Several small keyboards beside each other.
 *
 * Chords are easier to learn as shapes than as note lists, and a shape only
 * reads as a shape when you can see the next one next to it.
 */
function PianoRow({ visual }) {
  const [playing, setPlaying] = useState(false)

  const playAll = async () => {
    if (playing) {
      stopAll()
      setPlaying(false)
      return
    }
    setPlaying(true)
    const steps = visual.items.map((item) => item.play).filter(Boolean)
    await playMidiSequence(steps, { noteLength: 1.05, onEnd: () => setPlaying(false) })
  }

  return (
    <figure className="lesson-visual">
      <div className="lk-row">
        {visual.items.map((item) => (
          <div className="lk-cell" key={item.title}>
            <span className="lk-cell-title">{item.title}</span>
            {item.sub && <span className="lk-cell-sub">{item.sub}</span>}
            <LessonPiano
              size="mini"
              span={item.span}
              marks={item.marks}
              letters={item.letters}
              play={item.play}
              playAs={item.playAs || 'chord'}
              playLabel={item.playLabel || 'Hear it'}
            />
          </div>
        ))}
      </div>

      {visual.playAll && (
        <button type="button" className="lk-play wide" onClick={playAll}>
          {playing ? 'Stop' : visual.playAll}
        </button>
      )}
      {visual.caption && <figcaption className="lk-caption">{visual.caption}</figcaption>}
    </figure>
  )
}

/** Loudness as height. The flat row is what "robot" looks like. */
function Bars({ visual }) {
  return (
    <figure className="lesson-visual">
      {visual.rows.map((row) => (
        <div className={`lk-bars${row.good ? ' good' : ''}`} key={row.label}>
          <span className="lk-bars-label">{row.label}</span>
          <div className="lk-bars-track">
            {row.bars.map((height, i) => (
              <span key={i} className="lk-bar" style={{ height: `${height * 100}%` }} />
            ))}
          </div>
          <span className="lk-bars-note">{row.note}</span>
        </div>
      ))}
      {visual.caption && <figcaption className="lk-caption">{visual.caption}</figcaption>}
    </figure>
  )
}

/** Four beats to a bar, twice over. Filled means you play; empty means you don't. */
function Beats({ visual }) {
  return (
    <figure className="lesson-visual">
      {visual.rows.map((row) => (
        <div className={`lk-beats${row.good ? ' good' : ''}`} key={row.label}>
          <span className="lk-bars-label">{row.label}</span>
          <div className="lk-beats-track">
            {row.beats.map((hit, i) => (
              <span key={i} className={hit ? 'lk-beat on' : 'lk-beat'}>
                {(i % 4) + 1}
              </span>
            ))}
          </div>
          <span className="lk-bars-note">{row.note}</span>
        </div>
      ))}
      {visual.caption && <figcaption className="lk-caption">{visual.caption}</figcaption>}
    </figure>
  )
}
