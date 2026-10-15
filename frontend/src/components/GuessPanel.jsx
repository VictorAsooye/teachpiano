import { useEffect, useState } from 'react'
import {
  ROOT_CHOICES,
  gradeChords,
  gradeKey,
  identifyChord,
  noteLabel,
  parseChord,
} from '../guess.js'
import { midiUnavailableReason } from '../midi.js'

const KEY_VERDICTS = {
  correct: { tone: 'good', title: 'Correct.' },
  relative: {
    tone: 'close',
    title: 'Close enough to count.',
    note: 'That is the relative key — it shares all seven notes, so it is a defensible answer. The tonal centre sits elsewhere.',
  },
  parallel: {
    tone: 'close',
    title: 'Right root, wrong flavour.',
    note: 'You heard the tonic. It was the major/minor quality that slipped.',
  },
  wrong: { tone: 'bad', title: 'Not this time.' },
}

/**
 * The live piano strip. Shown in both stages: you need to be able to hunt for
 * the tonic against the track while naming the key, not only when naming chords.
 */
function MidiBar({ midi, useFlats, hint }) {
  if (!midi.supported) {
    // Silently hiding the button would just look like a missing feature.
    return (
      <p className="midi-unsupported">{midiUnavailableReason()} Typing works everywhere.</p>
    )
  }

  if (midi.status !== 'on') {
    return (
      <div className="midi-row">
        <button
          type="button"
          className="midi-connect"
          onClick={midi.connect}
          disabled={midi.status === 'connecting'}
        >
          {midi.status === 'connecting' ? 'Connecting…' : '🎹 Use my piano'}
        </button>
        {midi.status === 'error' && <span className="midi-error">{midi.error}</span>}
      </div>
    )
  }

  return (
    <div className="midi-row">
      <span className="midi-live">
        <span className="midi-dot" />
        {!midi.devices.length ? (
          <em>No instrument found. Plug your piano in over USB.</em>
        ) : midi.chord ? (
          <strong>{midi.chord.label}</strong>
        ) : midi.held.length ? (
          <strong>{midi.held.map((n) => noteLabel(n, useFlats)).join(' ')}</strong>
        ) : (
          <em>{hint}</em>
        )}
      </span>
      <label className="midi-sound">
        <input
          type="checkbox"
          checked={midi.sound}
          onChange={(event) => midi.setSound(event.target.checked)}
        />
        Sound
      </label>
    </div>
  )
}

/** Stage one: name the key before the app shows it. */
export function KeyGuess({ actual, onReveal, midi, useFlats = false }) {
  const [pc, setPc] = useState(null)
  const [mode, setMode] = useState('major')
  const [verdict, setVerdict] = useState(null)

  const submit = () => {
    if (pc === null) return
    setVerdict(gradeKey({ pc, mode }, actual))
  }

  const info = verdict ? KEY_VERDICTS[verdict] : null

  return (
    <div className="guess">
      <span className="section-label">Your turn</span>
      <h3 className="guess-title">What key is this song in?</h3>
      <p className="guess-hint">
        Play the song above and hunt for the note it wants to rest on. If you have a piano
        connected you can play along to test your answer.
      </p>

      <MidiBar midi={midi} useFlats={useFlats} hint="play along to find the tonic" />

      <div className="root-grid">
        {ROOT_CHOICES.map((choice) => (
          <button
            key={choice.pc}
            type="button"
            className={pc === choice.pc ? 'root-key selected' : 'root-key'}
            onClick={() => {
              setPc(choice.pc)
              setVerdict(null)
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>

      <div className="guess-actions">
        <div className="segmented" role="group" aria-label="Major or minor">
          {['major', 'minor'].map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? 'segment selected' : 'segment'}
              onClick={() => {
                setMode(option)
                setVerdict(null)
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <button type="button" className="check" onClick={submit} disabled={pc === null}>
          Check
        </button>
        <button type="button" className="skip" onClick={onReveal}>
          Skip, just show me
        </button>
      </div>

      {info && (
        <div className={`verdict ${info.tone}`}>
          {/* One paragraph, not loose inline nodes: the verdict box is a
              flex column, so each bare child would land on its own line and
              strand the full stop by itself. */}
          <p className="verdict-main">
            <strong>{info.title}</strong>{' '}
            {verdict === 'correct' ? (
              <>You called it.</>
            ) : (
              <>
                The detector heard <strong>{actual.name}</strong>.
              </>
            )}
          </p>
          {info.note && <p className="verdict-note">{info.note}</p>}
          <button type="button" className="reveal" onClick={onReveal}>
            {verdict === 'correct'
              ? 'Next: guess the chords →'
              : 'Reveal the key and continue →'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Stage two: name the chords — by typing them, or by playing them. */
export function ChordGuess({ chords, onReveal, midi, useFlats = false, songKey = null }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)

  // The connection is owned above us so it survives the move from the key stage
  // to this one; we just say what a finished chord should do while we're here.
  useEffect(() => {
    midi.onCommit((notes) => {
      const chord = identifyChord(notes, { useFlats })
      if (!chord) return
      // Played chords land in the same box you can type into, so the answer
      // stays editable and there is only one thing for the grader to read.
      setText((current) => (current.trim() ? `${current.trim()} ${chord.label}` : chord.label))
      setResult(null)
    })
    return () => midi.onCommit(null)
  }, [midi, useFlats])

  const submit = (event) => {
    event.preventDefault()
    if (!text.trim()) return
    setResult(gradeChords(text, chords, { key: songKey }))
  }

  const tone = result
    ? result.matched.length === result.total && !result.extra.length
      ? 'good'
      : result.matched.length
        ? 'close'
        : 'bad'
    : null

  return (
    <div className="guess">
      <span className="section-label">Your turn</span>
      <h3 className="guess-title">Which chords does it use?</h3>
      <p className="guess-hint">
        Play them, or type them. Letters like <code>D A Bm</code>, or numbers like{' '}
        <code>6 5 1</code>. Order does not matter.
      </p>

      <MidiBar midi={midi} useFlats={useFlats} hint="play a chord, then lift your hands" />

      <form className="chord-form" onSubmit={submit}>
        <input
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setResult(null)
          }}
          placeholder="D A Bm F#m G"
          aria-label="Your chord guess"
        />
        <button type="submit" className="check" disabled={!text.trim()}>
          Check
        </button>
      </form>

      <div className="guess-actions secondary">
        {text.trim() && (
          <button type="button" className="skip" onClick={() => setText('')}>
            Clear
          </button>
        )}
        <button type="button" className="skip" onClick={onReveal}>
          Skip, just show me
        </button>
      </div>

      {result && (
        <div className={`verdict ${tone}`}>
          <p className="verdict-main">
            <strong>
              You got {result.matched.length} of {result.total}.
            </strong>
          </p>
          <div className="verdict-chips">
            {result.matched.map((chord) => (
              <span key={`m${chord.key}`} className="vchip hit">
                {chord.label}
              </span>
            ))}
            {result.missed.map((chord) => (
              <span key={`x${chord.key}`} className="vchip miss">
                {chord.label}
              </span>
            ))}
          </div>
          {result.bonus.length > 0 && (
            <p className="verdict-note">
              Good ear — you also caught {result.bonus.map((chord) => chord.label).join(', ')},
              which {result.bonus.length === 1 ? 'only appears' : 'only appear'} briefly.
            </p>
          )}
          {result.fleetingMissed.length > 0 && (
            <p className="verdict-note">
              Also in there, but only in passing:{' '}
              {result.fleetingMissed.map((chord) => chord.label).join(', ')}. Not counted against
              you.
            </p>
          )}
          {result.extra.length > 0 && (
            <p className="verdict-note">
              Not in the song: {result.extra.map((chord) => chord.label).join(', ')}. Worth a second
              listen — a chord you are sure you heard may be a passing bass note.
            </p>
          )}
          {result.nothingUnderstood && (
            <p className="verdict-note">
              No chords in that. Try letters — <code>Gm F Bb</code> — or numbers —{' '}
              <code>6 5 1</code>.
            </p>
          )}
          <button type="button" className="reveal" onClick={onReveal}>
            Show the progression →
          </button>
        </div>
      )}
    </div>
  )
}

export { parseChord }
