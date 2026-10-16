/**
 * What you just played, drawn.
 *
 * One bar per chord: height is how hard you hit it, position is when, width is
 * how long you held it. The two faults that are hardest to hear in your own
 * playing -- a flat row of equal heights, and bars spaced like graph paper --
 * are the two that are impossible to miss here.
 *
 * Deliberately not a piano roll. Every note at its own pitch is a prettier
 * picture and a worse teacher; the question being answered is "how did it
 * sound", not "what did I play".
 */
export default function StyleStrip({ chords, seconds, highlight = null }) {
  if (!chords?.length || !seconds) return null

  const start = chords[0].start
  const span = Math.max(seconds, 0.001)
  const at = (time) => ((time - start) / span) * 100

  return (
    <div className="strip">
      <div className="strip-axis">
        <span>hard</span>
        <span>soft</span>
      </div>

      <div className="strip-plot">
        {/* Where "about right" sits, so a flat take has something to be flat against. */}
        <span className="strip-guide" style={{ bottom: '55%' }} />

        {chords.map((chord, i) => {
          const peak = Math.max(...chord.notes.map((n) => n.velocity))
          const held = Math.max(...chord.notes.map((n) => n.duration || 0))
          const next = chords[i + 1]
          const slot = next ? next.start - chord.start : held || 0.4
          const width = Math.max(1.2, (Math.min(held || slot * 0.6, slot) / span) * 100)
          const lit = highlight && (i === highlight.index || i === highlight.index - 1)

          return (
            <span
              key={`${chord.start}-${i}`}
              className={lit ? 'strip-bar lit' : 'strip-bar'}
              style={{
                left: `${at(chord.start)}%`,
                width: `${width}%`,
                height: `${Math.max(6, peak * 100)}%`,
              }}
              title={`${chord.notes.length} notes, ${Math.round(peak * 100)}% velocity`}
            />
          )
        })}
      </div>

      <div className="strip-time">
        <span>0s</span>
        <span>{seconds.toFixed(0)}s</span>
      </div>
    </div>
  )
}
