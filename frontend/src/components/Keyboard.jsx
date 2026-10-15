const WHITE = [0, 2, 4, 5, 7, 9, 11]
const BLACK = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 } // pitch class -> which white key it sits after

/**
 * Two octaves of piano keys. `highlight` gets the strong colour (the chord
 * being played), `shade` a softer one (the notes of the key's scale).
 */
export default function Keyboard({ highlight = [], shade = [], octaves = 2 }) {
  const isHot = (pc) => highlight.includes(pc % 12)
  const isShaded = (pc) => shade.includes(pc % 12)

  // When a scale is being shown, the keyboard switches to "some of these are
  // out of play" mode: in-scale keys stay bright and everything else is dimmed.
  // Tinting the in-scale keys instead was too subtle to see at a glance.
  const hasScale = shade.length > 0

  return (
    <div
      className={hasScale ? 'keyboard has-scale' : 'keyboard'}
      style={{ '--octaves': octaves }}
    >
      {Array.from({ length: octaves }, (_, octave) => (
        <div className="octave" key={octave}>
          {WHITE.map((pc) => (
            <div
              key={pc}
              className={`key white${isHot(pc) ? ' hot' : ''}${isShaded(pc) ? ' shaded' : ''}`}
            />
          ))}
          {Object.entries(BLACK).map(([pc, after]) => (
            <div
              key={pc}
              className={`key black${isHot(+pc) ? ' hot' : ''}${isShaded(+pc) ? ' shaded' : ''}`}
              style={{ left: `calc(${after + 1} * (100% / 7) - (100% / 7) * 0.3)` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
