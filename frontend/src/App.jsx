import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api.js'
import { playChords, playOneChord, playScale, stopAll } from './player.js'
import ChordTimeline from './components/ChordTimeline.jsx'
import Keyboard from './components/Keyboard.jsx'
import Library from './components/Library.jsx'
import { ChordGuess, KeyGuess } from './components/GuessPanel.jsx'
import VideoPlayer from './components/VideoPlayer.jsx'
import useMidi from './useMidi.js'
import { MODE_IDS, applyFilter, buildFilters, pickRandom } from './library.js'
import { NOTATIONS, relabel } from './notation.js'
import KeyTrainer from './components/KeyTrainer.jsx'
import EarTrainer from './components/EarTrainer.jsx'
import LiveKey from './components/LiveKey.jsx'
import Lessons from './components/Lessons.jsx'
import SoundCheck from './components/SoundCheck.jsx'
import StyleCoach from './components/StyleCoach.jsx'
import { GROUP_OF, TABS, availableTabs } from './nav.js'

const POLL_INTERVAL = 1200

const formatClock = (seconds) => {
  const total = Math.max(0, Math.round(seconds || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
const GUESS_PREF = 'songdecoder:guessFirst'
const NOTATION_PREF = 'songdecoder:notation'

// localStorage throws in some privacy modes; the preference is not worth
// taking the app down for.
const readGuessPref = () => {
  try {
    return localStorage.getItem(GUESS_PREF) === '1'
  } catch {
    return false
  }
}

const writeGuessPref = (value) => {
  try {
    localStorage.setItem(GUESS_PREF, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [url, setUrl] = useState('')
  const [song, setSong] = useState(null)
  const [songs, setSongs] = useState([])
  const [categories, setCategories] = useState([])
  const [activeFilter, setActiveFilter] = useState(null)
  // Beginners land on the lessons, not on the analysis tool.
  const [tab, setTab] = useState('learn')
  const [view, setView] = useState('learn')
  // null while we find out. Everything but song decoding runs in the browser,
  // so the app stays fully usable when there is no server behind it.
  const [backendUp, setBackendUp] = useState(null)

  const openView = useCallback((id) => {
    stopAll()
    setTab(GROUP_OF[id] ?? id)
    setView(id)
  }, [])

  const openGroup = (group) => {
    stopAll()
    setTab(group.id)
    setView(group.items ? group.items[0].id : group.id)
  }
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [playing, setPlaying] = useState('none') // 'none' | 'progression' | 'scale'
  const [activeChord, setActiveChord] = useState(-1)
  const [activeScaleNote, setActiveScaleNote] = useState(-1)

  // Ear-training mode: hold the answers back until they've been guessed.
  const [guessFirst, setGuessFirst] = useState(readGuessPref)
  const [notation, setNotation] = useState(() => {
    try {
      return localStorage.getItem(NOTATION_PREF) || 'letters'
    } catch {
      return 'letters'
    }
  })
  const [stage, setStage] = useState('all') // 'key' -> 'chords' -> 'all'

  const pollTimer = useRef(null)
  // Last value written for the open song, so committing on Enter and again on
  // the blur that follows doesn't fire two identical writes.
  const savedCategory = useRef('')
  // The YouTube player, once it exists, so a chord row can seek it.
  const videoPlayer = useRef(null)

  // One connection for the whole session, shared by both guess stages.
  const midi = useMidi({ useFlats: song?.key?.use_flats ?? false })

  const refreshLibrary = useCallback(async () => {
    try {
      const { songs: list, categories: known } = await api.listSongs()
      setSongs(list)
      setCategories(known ?? [])
    } catch {
      /* the library is a nicety; don't block the main flow over it */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then(() => { if (!cancelled) { setBackendUp(true); refreshLibrary() } })
      .catch(() => { if (!cancelled) setBackendUp(false) })
    return () => {
      cancelled = true
      clearTimeout(pollTimer.current)
    }
  }, [refreshLibrary])

  // If song decoding vanished from under us, do not strand the user on it.
  useEffect(() => {
    if (backendUp === false && view === 'decode') {
      setTab('learn')
      setView('learn')
    }
  }, [backendUp, view])

  const stopPlayback = useCallback(() => {
    stopAll()
    setPlaying('none')
    setActiveChord(-1)
    setActiveScaleNote(-1)
  }, [])

  const showSong = useCallback(
    (loaded) => {
      stopPlayback()
      setSong(loaded)
      setJob(null)
      setStage(guessFirst ? 'key' : 'all')
      setShowAnyway(false)
      savedCategory.current = loaded.category || ''
    },
    [stopPlayback, guessFirst],
  )

  const toggleGuessFirst = () => {
    const next = !guessFirst
    setGuessFirst(next)
    writeGuessPref(next)
    // A Minor/Major chip would hand back the very answer the mode is hiding.
    if (next && MODE_IDS.has(activeFilter)) setActiveFilter(null)
    // Re-hide the current song so you can test yourself on it right away,
    // rather than having to load a different one.
    stopPlayback()
    setStage(next ? 'key' : 'all')
  }

  const pollJob = useCallback(
    async (jobId) => {
      try {
        const status = await api.getJob(jobId)
        setJob(status)
        if (status.status === 'done') {
          showSong(status.song)
          setBusy(false)
          refreshLibrary()
        } else if (status.status === 'error') {
          setError(status.error || 'Analysis failed.')
          setBusy(false)
          setJob(null)
        } else {
          pollTimer.current = setTimeout(() => pollJob(jobId), POLL_INTERVAL)
        }
      } catch (err) {
        setError(err.message)
        setBusy(false)
        setJob(null)
      }
    },
    [refreshLibrary, showSong],
  )

  const handleAnalyze = async (event) => {
    event.preventDefault()
    if (!url.trim() || busy) return
    setError(null)
    setBusy(true)
    stopPlayback()
    try {
      const result = await api.analyze(url.trim())
      if (result.status === 'cached') {
        showSong(result.song)
        setBusy(false)
      } else {
        setJob(result.job)
        pollJob(result.job.id)
      }
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const handleOpen = async (songId) => {
    setError(null)
    try {
      showSong(await api.getSong(songId))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (songId) => {
    try {
      await api.deleteSong(songId)
      if (song?.id === songId) {
        stopPlayback()
        setSong(null)
      }
      refreshLibrary()
    } catch (err) {
      setError(err.message)
    }
  }

  const startProgression = async (startIndex = 0) => {
    if (!song) return
    setPlaying('progression')
    setActiveScaleNote(-1)
    setActiveChord(startIndex)
    await playChords(song.playback.chords, {
      startIndex,
      onChord: setActiveChord,
      onEnd: stopPlayback,
    })
  }

  const startScale = async () => {
    if (!song) return
    setPlaying('scale')
    setActiveChord(-1)
    await playScale(song.playback.scale.notes, {
      onNote: setActiveScaleNote,
      onEnd: stopPlayback,
    })
  }

  const filters = buildFilters(songs, { includeMode: !guessFirst })
  const visibleSongs = applyFilter(songs, activeFilter)
  filters.activeLabel =
    [...filters.mine, ...filters.auto].find((f) => f.id === activeFilter)?.label ?? ''

  const handlePlayerReady = useCallback((player) => {
    videoPlayer.current = player
  }, [])

  // Clicking a chord jumps the video there. Falls back to playing the app's
  // own piano from that point when there is no video loaded yet.
  const seekTo = useCallback(
    (seconds, index) => {
      const player = videoPlayer.current
      if (player?.seekTo) {
        stopPlayback()
        player.seekTo(seconds, true)
        player.playVideo?.()
        setActiveChord(index)
        return true
      }
      return false
    },
    [stopPlayback],
  )

  // While the video plays, keep the chord chart in step with it.
  useEffect(() => {
    if (!song) return undefined
    const timer = setInterval(() => {
      const player = videoPlayer.current
      // 1 is YT.PlayerState.PLAYING. Checked numerically so we do not depend on
      // the API global having loaded.
      if (!player?.getCurrentTime || player.getPlayerState?.() !== 1) return
      const now = player.getCurrentTime()
      const list = song.playback.chords
      const index = list.findIndex((c) => now >= c.start && now < c.end)
      if (index >= 0) setActiveChord(index)
    }, 250)
    return () => clearInterval(timer)
  }, [song])

  const handleRandom = () => {
    const choice = pickRandom(visibleSongs, song?.id)
    if (choice) handleOpen(choice.id)
  }

  const saveCategory = async (value) => {
    if (!song) return
    const next = (value || '').trim()
    if (next === savedCategory.current) return
    savedCategory.current = next
    try {
      const updated = await api.setCategory(song.id, next)
      setSong((current) => (current && current.id === updated.id
        ? { ...current, category: updated.category }
        : current))
      refreshLibrary()
    } catch (err) {
      savedCategory.current = song.category || ''
      setError(err.message)
    }
  }

  const songKey = song ? { pc: song.key.tonic, mode: song.key.mode } : null
  const labelFor = (chord) => relabel(chord, songKey, notation)

  const chooseNotation = (id) => {
    setNotation(id)
    try {
      localStorage.setItem(NOTATION_PREF, id)
    } catch {
      /* preference only */
    }
  }

  const chords = song?.playback.chords ?? []
  const scale = song?.playback.scale
  const notMusic = song ? song.music?.is_music === false : false
  // A warning, never a block: the detector is a heuristic, and if you disagree
  // you can look at what it found anyway.
  const [showAnyway, setShowAnyway] = useState(false)
  const keyRevealed = stage !== 'key'
  const chordsRevealed = stage === 'all'
  const current = activeChord >= 0 ? chords[activeChord] : null
  const scaleNoteMidi = activeScaleNote >= 0 ? scale?.midi[activeScaleNote] : null
  const highlighted =
    playing === 'scale' && scaleNoteMidi != null
      ? [scaleNoteMidi % 12]
      : current?.pitch_classes ?? []

  return (
    <div className="app">
      <header className="hero">
        <h1>Song Decoder</h1>
        <p>Learn the piano. Train your ear. Find the key of any song.</p>
      </header>

      <nav className="tabs" role="tablist">
        {availableTabs(backendUp).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'tab on' : 'tab'}
            onClick={() => openGroup(item)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {availableTabs(backendUp).filter((g) => g.id === tab && g.items).map((group) => (
        <div className="subnav" key={group.id}>
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'subnav-item on' : 'subnav-item'}
              onClick={() => openView(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>
      ))}

      <SoundCheck />

      {view === 'learn' && <Lessons onGoTo={openView} />}
      {view === 'keys' && <KeyTrainer midi={midi} />}
      {view === 'ear' && <EarTrainer midi={midi} />}
      {view === 'live' && <LiveKey />}
      {view === 'style' && <StyleCoach midi={midi} />}

      {view === 'decode' && (
      <form className="composer" onSubmit={handleAnalyze}>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube link"
          aria-label="YouTube link"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !url.trim()}>
          {busy ? 'Working…' : 'Analyze'}
        </button>
      </form>

      )}

      {view === 'decode' && job && job.status !== 'done' && (
        <div className="progress">
          <div className="progress-track">
            <span style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
          </div>
          <p className="progress-stage">
            {job.stage}
            <span className="progress-hint"> · about 30 seconds</span>
          </p>
        </div>
      )}

      {view === 'decode' && error && <p className="error">{error}</p>}

      {view === 'decode' && (
      <>
      <div className="mode-row">
        <button
          type="button"
          className={guessFirst ? 'switch on' : 'switch'}
          role="switch"
          aria-checked={guessFirst}
          onClick={toggleGuessFirst}
        >
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          Guess first
        </button>
        <span className="mode-note">
          {guessFirst
            ? 'Answers hidden until you guess.'
            : 'Answers show straight away.'}
        </span>
      </div>

      <main className="layout">
        <section className="results">
          {!song && !job && (
            <div className="placeholder">
              <p>Nothing loaded yet.</p>
              <p className="muted">Paste a song above, or pick one from the library.</p>
            </div>
          )}

          {song && (
            <>
              <div className="song-head">
                <div>
                  <h2>{song.title}</h2>
                  <p className="song-sub">
                    {song.uploader && <span className="muted">{song.uploader}</span>}
                    <input
                      className="category-input"
                      list="known-categories"
                      defaultValue={song.category || ''}
                      // Keyed by song so switching songs reloads the field
                      // instead of carrying the last one's tag across.
                      key={`cat-${song.id}`}
                      placeholder="+ category"
                      maxLength={40}
                      aria-label="Category"
                      onBlur={(event) => saveCategory(event.target.value.trim())}
                      onKeyDown={(event) => {
                        // Commit on Enter directly rather than leaning on the
                        // blur that follows: if blur never fires, the edit is
                        // silently thrown away.
                        if (event.key === 'Enter') {
                          saveCategory(event.target.value)
                          event.target.blur()
                        }
                        if (event.key === 'Escape') {
                          event.target.value = song.category || ''
                          event.target.blur()
                        }
                      }}
                    />
                    <datalist id="known-categories">
                      {categories.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </p>
                </div>
              </div>

              <VideoPlayer
                videoId={song.video_id}
                thumbnail={song.thumbnail}
                title={song.title}
                onReady={handlePlayerReady}
              />

              {song.truncated && (
                <p className="truncated-note">
                  Analysed the first {Math.round(song.duration / 60)} minutes of this{' '}
                  {Math.round(song.full_duration / 60)}-minute video.
                </p>
              )}

              {notMusic && (
                <div className="not-music">
                  <p className="not-music-title">This doesn&apos;t sound like music.</p>
                  <p className="not-music-body">
                    Scores {Math.round((song.music?.score ?? 0) * 100)}% for how musical it
                    is. Speech and podcasts land here. Any key it found below is probably
                    meaningless.
                  </p>
                  {!showAnyway && (
                    <button
                      type="button"
                      className="reveal"
                      onClick={() => setShowAnyway(true)}
                    >
                      Show me the analysis anyway →
                    </button>
                  )}
                </div>
              )}

              {!notMusic || showAnyway ? (
              <>
              {!keyRevealed && (
                <KeyGuess
                  actual={{ pc: song.key.tonic, mode: song.key.mode, name: song.key.name }}
                  onReveal={() => setStage('chords')}
                  midi={midi}
                  useFlats={song.key.use_flats}
                  songKey={{
                    pc: song.key.tonic,
                    mode: song.key.mode,
                    useFlats: song.key.use_flats,
                  }}
                />
              )}

              {keyRevealed && (
              <div className="key-card">
                <span className="section-label">Key</span>
                <div className="key-headline">
                  <strong className="key-name">{song.key.name}</strong>
                  <span className="key-stats">
                    <span className="stat">{Math.round(song.tempo)} BPM</span>
                    <span className="stat">
                      {Math.round(song.key.confidence * 100)}% confident
                    </span>
                  </span>
                </div>
                {song.key.alternatives?.length > 0 && (
                  <p className="key-alt">
                    If that sounds wrong, try{' '}
                    {song.key.alternatives.map((alt) => alt.name).join(' or ')}.
                  </p>
                )}

                <div className="divider" />

                <div className="scale-row">
                  {scale.degrees.map((note, index) => (
                    <span
                      key={note + index}
                      className={
                        playing === 'scale' && scale.notes[activeScaleNote] === note
                          ? 'scale-note lit'
                          : 'scale-note'
                      }
                    >
                      {note.replace(/\d/, '')}
                    </span>
                  ))}
                </div>

                <Keyboard highlight={highlighted} shade={scale.pitch_classes} />
                <p className="keyboard-caption">
                  Dots mark the notes of this key. A blue key is sounding right now.
                </p>

                <div className="controls">
                  {/* Playing the progression is playing the answer, so it stays
                      out of reach until the chords have been guessed. */}
                  {chordsRevealed && (
                    <button
                      type="button"
                      className={playing === 'progression' ? 'playing' : 'primary'}
                      onClick={playing === 'progression' ? stopPlayback : () => startProgression(0)}
                    >
                      <span className="glyph">{playing === 'progression' ? '■' : '▶'}</span>
                      {playing === 'progression' ? 'Stop' : 'Play progression'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={
                      playing === 'scale' ? 'playing' : chordsRevealed ? undefined : 'primary'
                    }
                    onClick={playing === 'scale' ? stopPlayback : startScale}
                  >
                    <span className="glyph">{playing === 'scale' ? '■' : '▶'}</span>
                    {playing === 'scale' ? 'Stop' : `Play ${song.key.name} scale`}
                  </button>
                </div>
              </div>
              )}

              {keyRevealed && !chordsRevealed && (
                <ChordGuess
                  chords={chords}
                  onReveal={() => setStage('all')}
                  midi={midi}
                  useFlats={song.key.use_flats}
                  songKey={{
                    pc: song.key.tonic,
                    mode: song.key.mode,
                    useFlats: song.key.use_flats,
                  }}
                />
              )}

              {song.modulates && song.key_timeline?.length > 1 && (
                <div className="modulations">
                  <span className="section-label">This song changes key</span>
                  <div className="mod-list">
                    {song.key_timeline.map((seg) => (
                      <button
                        type="button"
                        className="mod-seg"
                        key={`${seg.start}-${seg.name}`}
                        onClick={() => seekTo(seg.start, chords.findIndex((c) => c.end > seg.start))}
                        title={`Jump to ${formatClock(seg.start)}`}
                      >
                        <strong>{seg.name}</strong>
                        <span>
                          {formatClock(seg.start)} – {formatClock(seg.end)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="keyboard-caption">
                    The key above is where it spends most of its time. Tap a section to jump
                    there.
                  </p>
                </div>
              )}

              {chordsRevealed && (
              <div className="chips-block">
                <span className="section-label">Chords in this song</span>
                <div className="notation-pick">
                  {NOTATIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={notation === option.id ? 'notation on' : 'notation'}
                      onClick={() => chooseNotation(option.id)}
                      title={option.example}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="chips">
                  {song.unique_chords.map((label) => {
                    const example = chords.find((chord) => chord.label === label)
                    return (
                      <button
                        key={label}
                        type="button"
                        className="chip"
                        title="Hear this chord"
                        onClick={() => example && playOneChord(example.notes)}
                      >
                        {example ? labelFor(example) : label}
                      </button>
                    )
                  })}
                </div>
              </div>
              )}

              {chordsRevealed && (
                <>
                  <span className="section-label">Progression</span>
                  <ChordTimeline
                    chords={chords}
                    activeIndex={activeChord}
                    labelFor={labelFor}
                    onPlayFrom={(index) => {
                      // Prefer the real recording; the piano is the fallback.
                      if (!seekTo(chords[index].start, index)) startProgression(index)
                    }}
                    seeksVideo={!!videoPlayer.current}
                  />
                </>
              )}
              </>
              ) : null}
            </>
          )}
        </section>

        <aside className="sidebar">
          <span className="section-label">Library</span>
          <Library
            songs={songs}
            visible={visibleSongs}
            filters={filters}
            activeFilter={activeFilter}
            onFilter={setActiveFilter}
            onRandom={handleRandom}
            currentId={song?.id}
            onOpen={handleOpen}
            onDelete={handleDelete}
            hideKey={guessFirst}
          />
        </aside>
      </main>
      </>
      )}
    </div>
  )
}
