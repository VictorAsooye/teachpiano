import { useState } from 'react'
import { LESSONS, STAGES } from '../lessons.js'
import { pathTo } from '../nav.js'

/** Turn **bold** into real bold, so the lesson text can emphasise the key idea. */
function RichText({ children }) {
  const parts = children.split(/(\*\*[^*]+\*\*)/g)
  return (
    <p className="lesson-para">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  )
}

/**
 * The curriculum, as a list you work down.
 *
 * Nothing is locked and nothing is saved — you can open any level at any time.
 * Each one ends by sending you to the tool that makes it real, because reading
 * about a key teaches you nothing until you play one.
 */
export default function Lessons({ onGoTo }) {
  const [open, setOpen] = useState(1)

  return (
    <div className="trainer">
      <div className="lessons-intro">
        <h3 className="trainer-key">Learn the piano</h3>
        <p className="guess-hint">
          Work down in order. Read a level, then press the button to go and play it.
        </p>
      </div>

      {STAGES.map((stage) => (
        <section className="stage" key={stage.name}>
          <div className="stage-head">
            <span className="section-label">{stage.name}</span>
            <span className="stage-hint">{stage.hint}</span>
          </div>

          {LESSONS.filter((l) => l.level >= stage.from && l.level <= stage.to).map((lesson) => {
            const isOpen = open === lesson.level
            return (
              <article key={lesson.level} className={isOpen ? 'lesson open' : 'lesson'}>
                <button
                  type="button"
                  className="lesson-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? 0 : lesson.level)}
                >
                  <span className="lesson-number">{lesson.level}</span>
                  <span className="lesson-titles">
                    <strong>{lesson.title}</strong>
                    <span className="lesson-blurb">{lesson.blurb}</span>
                  </span>
                  <span className="lesson-mins">{lesson.minutes} min</span>
                </button>

                {isOpen && (
                  <div className="lesson-body">
                    {lesson.learn.map((para, i) => (
                      <RichText key={i}>{para}</RichText>
                    ))}

                    <div className="lesson-try">
                      <span className="section-label">Now go and play it</span>
                      <p className="lesson-para">{lesson.tryIt.what}</p>
                      <button
                        type="button"
                        className="check"
                        onClick={() => onGoTo(lesson.tryIt.tab)}
                      >
                        Open {pathTo(lesson.tryIt.tab)} →
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}
