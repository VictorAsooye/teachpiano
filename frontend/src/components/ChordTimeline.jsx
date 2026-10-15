import { useEffect, useRef } from 'react'

const formatTime = (seconds) => {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** The scrolling chord list. Click any row to start playback from there. */
export default function ChordTimeline({ chords, activeIndex, onPlayFrom, seeksVideo, labelFor }) {
  const listRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    const row = activeRef.current
    if (!list || !row) return

    // Deliberately not scrollIntoView: that scrolls every ancestor that can
    // scroll, so following the progression would drag the whole page around.
    //
    // Measured with rects rather than offsetTop, because offsetTop is relative
    // to the nearest *positioned* ancestor -- which is the results column, not
    // this list -- and mixing those two coordinate spaces silently scrolls to
    // the wrong place.
    const listRect = list.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const padding = 8

    let delta = 0
    if (rowRect.top < listRect.top) {
      delta = rowRect.top - listRect.top - padding
    } else if (rowRect.bottom > listRect.bottom) {
      delta = rowRect.bottom - listRect.bottom + padding
    }
    if (!delta) return

    const target = list.scrollTop + delta
    list.scrollTo({ top: target, behavior: 'smooth' })

    // Smooth scrolling rides requestAnimationFrame, so in a throttled or hidden
    // tab the animation simply never runs and the list silently stays put.
    // Check back and land it outright if the animation didn't happen.
    const settle = setTimeout(() => {
      if (Math.abs(list.scrollTop - target) > 2) list.scrollTop = target
    }, 400)
    return () => clearTimeout(settle)
  }, [activeIndex])

  return (
    <ol className="timeline" ref={listRef}>
      {chords.map((chord, index) => {
        const silent = !chord.notes || chord.notes.length === 0
        const active = index === activeIndex
        return (
          <li
            key={`${chord.start}-${index}`}
            ref={active ? activeRef : undefined}
            className={`timeline-row${active ? ' active' : ''}${silent ? ' silent' : ''}`}
          >
            <button
              type="button"
              className="timeline-button"
              onClick={() => !silent && onPlayFrom(index)}
              disabled={silent}
              title={
                silent
                  ? 'No chord detected here'
                  : seeksVideo
                    ? `Jump the video to ${formatTime(chord.start)}`
                    : `Play from ${formatTime(chord.start)}`
              }
            >
              <span className="timeline-time">{formatTime(chord.start)}</span>
              <span className="timeline-chord">{labelFor ? labelFor(chord) : chord.label}</span>
              <span className="timeline-notes">
                {silent ? '—' : chord.notes.slice(1).join(' · ')}
              </span>
              <span className="timeline-confidence" title="How well the audio matched this chord">
                <span
                  className="confidence-bar"
                  style={{ width: `${Math.round((chord.confidence ?? 0) * 100)}%` }}
                />
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
