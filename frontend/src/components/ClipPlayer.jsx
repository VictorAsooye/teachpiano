import { useEffect, useRef, useState } from 'react'

/**
 * Load YouTube's IFrame API once, however many players ask for it.
 *
 * Shared with VideoPlayer by duplication rather than by a common module: both
 * copies are eight lines and a promise, and the alternative is a third file
 * that exists only to be imported twice.
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
    setTimeout(() => reject(new Error('YouTube player timed out')), 10000)
  })
  return apiPromise
}

/**
 * Play one stretch of a song, over and over if you need it.
 *
 * Twenty seconds is the whole exercise: long enough that the key settles,
 * short enough that you are hunting rather than listening. The clip stops
 * itself at the end instead of running on into the next section, which on a
 * worship song is quite often a key change.
 *
 * The video is left visible and unobscured, as YouTube's terms require. That
 * does mean the song's title is on screen -- which matters less than it
 * sounds, because knowing a song is not knowing its key, and hunting for the
 * tonic is the skill either way.
 */
export default function ClipPlayer({ videoId, start, length, onPlayingChange }) {
  const [mounted, setMounted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const mount = useRef(null)
  const player = useRef(null)
  const stopAt = useRef(null)
  const report = useRef(onPlayingChange)
  report.current = onPlayingChange

  const setBoth = (value) => {
    setPlaying(value)
    report.current?.(value)
  }

  // A new clip is a new player; leaving the old one would keep the previous
  // song audible under the next question.
  useEffect(() => {
    setMounted(false)
    setBoth(false)
    setFailed(false)
    clearTimeout(stopAt.current)
    if (player.current) {
      try {
        player.current.destroy()
      } catch {
        /* already gone */
      }
      player.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  useEffect(() => {
    if (!mounted || !mount.current) return undefined
    let cancelled = false

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mount.current) return
        player.current = new YT.Player(mount.current, {
          videoId,
          playerVars: { autoplay: 1, rel: 0, playsinline: 1, start: Math.floor(start) },
          events: {
            onReady: (event) => {
              if (cancelled) return
              event.target.seekTo(start, true)
              event.target.playVideo()
              schedule()
            },
            onStateChange: (event) => {
              if (cancelled) return
              const YTP = window.YT.PlayerState
              if (event.data === YTP.PLAYING) {
                setBoth(true)
                schedule()
              } else if (event.data === YTP.PAUSED || event.data === YTP.ENDED) {
                setBoth(false)
                clearTimeout(stopAt.current)
              }
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      clearTimeout(stopAt.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, videoId, start, length])

  /**
   * Stop at the end of the window.
   *
   * Timed from where playback actually is rather than from when play was
   * pressed, because buffering, a pre-roll ad, or a scrub all put those
   * several seconds apart.
   */
  const schedule = () => {
    clearTimeout(stopAt.current)
    const tick = () => {
      const p = player.current
      if (!p?.getCurrentTime) return
      const remaining = start + length - p.getCurrentTime()
      if (remaining <= 0.1) {
        try {
          p.pauseVideo()
        } catch {
          /* gone */
        }
        setBoth(false)
        return
      }
      stopAt.current = setTimeout(tick, Math.min(remaining * 1000, 500))
    }
    tick()
  }

  const replay = () => {
    const p = player.current
    if (!p?.seekTo) {
      setMounted(true)
      return
    }
    p.seekTo(start, true)
    p.playVideo()
    schedule()
  }

  const stop = () => {
    try {
      player.current?.pauseVideo()
    } catch {
      /* gone */
    }
    clearTimeout(stopAt.current)
    setBoth(false)
  }

  useEffect(
    () => () => {
      clearTimeout(stopAt.current)
      try {
        player.current?.destroy()
      } catch {
        /* already gone */
      }
    },
    [],
  )

  return (
    <div className="clip">
      {mounted ? (
        <div className="video-frame">
          <div ref={mount} />
        </div>
      ) : (
        <div className="clip-idle">
          <span className="clip-idle-note">♪</span>
          <p>A singer, twenty seconds. Listen for where it comes to rest.</p>
        </div>
      )}

      <div className="controls">
        {!mounted ? (
          <button type="button" className="primary" onClick={() => setMounted(true)}>
            <span className="glyph">▶</span>
            Play the clip
          </button>
        ) : (
          <>
            <button
              type="button"
              className={playing ? 'playing' : 'primary'}
              onClick={playing ? stop : replay}
            >
              <span className="glyph">{playing ? '■' : '▶'}</span>
              {playing ? 'Stop' : 'Hear it again'}
            </button>
          </>
        )}
      </div>

      {failed && (
        <a
          className="video-fallback"
          href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}`}
          target="_blank"
          rel="noreferrer"
        >
          Player did not load — open it on YouTube ↗
        </a>
      )}
    </div>
  )
}
