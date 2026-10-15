import { useEffect, useRef, useState } from 'react'

/**
 * Load YouTube's IFrame API once, however many players ask for it.
 *
 * A plain embed cannot be controlled: seeking to a chord would mean reloading
 * the iframe with a new start time, which restarts the video every click. The
 * API gives us seekTo() and the current playback position, which is what makes
 * the chord chart able to follow along.
 */
let apiPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('Could not load the YouTube player'))
    document.head.appendChild(script)
    // Don't hang forever if the network or a blocker swallows it.
    setTimeout(() => reject(new Error('YouTube player timed out')), 10000)
  })
  return apiPromise
}

/**
 * The song itself, playable in the page.
 *
 * The thumbnail loads first and the real player only mounts once you click it —
 * YouTube's iframe pulls a lot of weight and sets cookies, and neither should
 * happen to someone who just wanted to look at a chord chart.
 */
export default function VideoPlayer({ videoId, thumbnail, title, onReady }) {
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const mount = useRef(null)
  const player = useRef(null)
  // Held in a ref so effects never depend on it. Callers pass an inline arrow,
  // which is a new function every render -- depending on it re-ran the reset
  // effect constantly and tore the player down as fast as it was built.
  const ready = useRef(onReady)
  ready.current = onReady

  // A different song means a different player.
  useEffect(() => {
    setPlaying(false)
    setFailed(false)
    if (player.current) {
      try {
        player.current.destroy()
      } catch {
        /* already gone */
      }
      player.current = null
      ready.current?.(null)
    }
  }, [videoId])

  useEffect(() => {
    if (!playing || !mount.current) return undefined
    let cancelled = false

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mount.current) return
        player.current = new YT.Player(mount.current, {
          videoId,
          playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
          events: {
            onReady: (event) => {
              if (!cancelled) ready.current?.(event.target)
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [playing, videoId])

  useEffect(
    () => () => {
      try {
        player.current?.destroy()
      } catch {
        /* already gone */
      }
    },
    [],
  )

  if (!videoId) return null

  if (!playing) {
    return (
      <button type="button" className="video-poster" onClick={() => setPlaying(true)}>
        {thumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="video-poster-blank" />
        )}
        <span className="video-play">
          <span className="video-play-glyph">▶</span>
          Play the song
        </span>
      </button>
    )
  }

  return (
    <>
      <div className="video-frame">
        <div ref={mount} />
      </div>
      {/* Some uploads disallow embedding outright and just show "Video
          unavailable" in the frame. There has to be a way through to the song
          itself, or the whole guess-by-ear idea falls over. */}
      <a
        className="video-fallback"
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noreferrer"
      >
        {failed ? 'Player did not load — open it on YouTube ↗' : 'Not playing? Open it on YouTube ↗'}
      </a>
    </>
  )
}
