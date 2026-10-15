import { useEffect, useRef, useState } from 'react'
import { KeyTracker, dbToMagnitudes, noteBands, spectrumToChroma } from '../liveKey.js'
import Keyboard from './Keyboard.jsx'

const FFT_SIZE = 16384 // ~2.7 Hz bins at 44.1 kHz — fine enough to separate low semitones

/**
 * Point the microphone at whoever is singing and read the key off the screen.
 *
 * Built for standing at a keyboard mid-service: the answer is the biggest thing
 * on the page, and everything else is secondary.
 */
export default function LiveKey() {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const [reading, setReading] = useState(null)
  const [level, setLevel] = useState(0)
  const [warm, setWarm] = useState(false)

  const rig = useRef(null)

  const stop = () => {
    const r = rig.current
    if (r) {
      clearInterval(r.timer)
      r.stream.getTracks().forEach((t) => t.stop())
      r.ctx.close()
      rig.current = null
    }
    setListening(false)
    setLevel(0)
  }

  useEffect(() => stop, [])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // All three of these are designed for speech and actively damage a
          // musical signal — gain riding and spectral subtraction change the
          // very balance between notes we are trying to measure.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)

      const bands = noteBands(ctx.sampleRate, FFT_SIZE)
      const tracker = new KeyTracker({ halfLife: 6, holdFrames: 12 })
      const db = new Float32Array(analyser.frequencyBinCount)
      const mags = new Float32Array(analyser.frequencyBinCount)
      const time = new Float32Array(analyser.fftSize)

      let last = performance.now()
      let lastPaint = 0
      const tick = () => {
        const now = performance.now()
        const dt = Math.min(0.5, (now - last) / 1000)
        last = now

        analyser.getFloatTimeDomainData(time)
        let sum = 0
        for (let i = 0; i < time.length; i++) sum += time[i] * time[i]
        const rms = Math.sqrt(sum / time.length)
        const loudness = Math.min(1, rms * 8)

        // Low enough to work with a quiet laptop mic across a room. The noise
        // floor is now removed inside spectrumToChroma, so quiet frames cost
        // far less than they used to.
        if (rms > 0.0015) {
          analyser.getFloatFrequencyData(db)
          dbToMagnitudes(db, mags)
          tracker.push(spectrumToChroma(mags, bands), dt, loudness)
        }

        // Analyse every frame, but only repaint ten times a second. Pushing
        // React state at 60fps re-rendered the whole panel on every animation
        // frame for no visible benefit, and that is exactly the kind of waste
        // that makes a cheap laptop stutter.
        if (now - lastPaint > 100) {
          lastPaint = now
          setLevel(loudness)
          setReading(tracker.read())
          setWarm(tracker.warmedUp)
        }

      }

      // Driven by a timer, not requestAnimationFrame. rAF only fires while the
      // page is actually painting, so switching to another tab or another
      // window would silently stop the analysis — the one thing a tool you
      // glance at mid-song must not do.
      rig.current = { ctx, stream, tracker, timer: setInterval(tick, 40) }
      setListening(true)
      setReading(null)
      setWarm(false)
    } catch (err) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in the address bar and try again.'
          : `Could not open the microphone: ${err?.message ?? err}`,
      )
      setListening(false)
    }
  }

  const restart = () => {
    rig.current?.tracker.reset()
    setReading(null)
    setWarm(false)
  }

  const scalePcs = reading
    ? (reading.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map(
        (s) => (reading.pc + s) % 12,
      )
    : []

  return (
    <div className="trainer">
      <div className="live-stage">
        {!listening && (
          <>
            <h3 className="trainer-key">Live key finder</h3>
            <p className="guess-hint">
              Point your mic at whoever is singing. The key shows up big, below.
            </p>
            <p className="trainer-tip">
              It gives you the key of the <strong>song</strong>, not the chord being played
              right now. Give it a few seconds.
            </p>
            <button type="button" className="check" onClick={start}>
              🎤 Start listening
            </button>
            {error && <p className="midi-error">{error}</p>}
          </>
        )}

        {listening && (
          <>
            <div className="live-readout">
              {reading ? (
                <>
                  <div className={reading.provisional ? 'live-key guess' : 'live-key'}>
                    {reading.name}
                  </div>
                  <div className="live-mode">
                    {reading.mode}
                    {reading.provisional && <span className="live-guess-tag">best guess</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="live-key waiting">—</div>
                  <div className="live-mode">{warm ? 'still deciding' : 'listening…'}</div>
                </>
              )}
            </div>

            {reading && (
              <>
                <div className="live-confidence" title="How sure it is">
                  <span style={{ width: `${Math.round(reading.confidence * 100)}%` }} />
                </div>
                <p className="live-sub">
                  {Math.round(reading.confidence * 100)}% sure
                  {reading.ranked?.[1] && reading.confidence < 0.6
                    ? ` · could also be ${reading.ranked[1].name} ${reading.ranked[1].mode}`
                    : ''}
                </p>
                <Keyboard highlight={[reading.pc]} shade={scalePcs} />
                <p className="keyboard-caption">
                  Blue is home. The dots are the rest of {reading.name} {reading.mode}.
                </p>
              </>
            )}

            <div className="mic-meter" aria-label="Microphone level">
              <span style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <p className="live-sub">
              {level < 0.02 ? 'Not hearing anything' : 'Hearing you'}
            </p>

            <div className="controls">
              <button type="button" className="primary" onClick={restart}>
                Start over
              </button>
              <button type="button" onClick={stop}>
                Stop
              </button>
            </div>
            <p className="trainer-tip">Hit <strong>Start over</strong> when the song changes.</p>
          </>
        )}
      </div>
    </div>
  )
}
