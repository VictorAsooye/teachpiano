import { useEffect, useState } from 'react'
import { audioAttempted, audioRunning, initAudio } from '../player.js'

/**
 * Says so when the browser is refusing to make sound.
 *
 * Silent audio is the one failure that gives you nothing to go on: the keys
 * light up, the progression scrolls, the button says Stop, and a kid at the
 * back concludes the website is broken. This appears only after something has
 * actually tried to play and the context still is not running, and it names
 * the thing that is almost always responsible on a phone.
 */
export default function SoundCheck() {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const check = () => setBlocked(audioAttempted() && !audioRunning())
    const timer = setInterval(check, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!blocked) return null

  return (
    <button type="button" className="sound-check" onClick={() => initAudio()}>
      <strong>No sound?</strong>
      <span>
        Tap here to turn audio on. On an iPhone or iPad, also check the little switch on the
        left-hand edge is not set to silent.
      </span>
    </button>
  )
}
