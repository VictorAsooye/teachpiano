const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(seconds || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function Chips({ label, filters, active, onPick }) {
  if (!filters.length) return null
  return (
    <div className="chip-row">
      <span className="chip-row-label">{label}</span>
      <div className="filter-chips">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={active === filter.id ? 'filter-chip on' : 'filter-chip'}
            // Clicking the active chip clears it, so there is always a way back
            // to the whole library without hunting for an "All" button.
            onClick={() => onPick(active === filter.id ? null : filter.id)}
          >
            {filter.label} <span className="filter-count">{filter.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Feature #5: everything analysed so far, replayable without re-analysing. */
export default function Library({
  songs,
  visible,
  filters,
  activeFilter,
  onFilter,
  onRandom,
  currentId,
  onOpen,
  onDelete,
  hideKey,
}) {
  const hasAnything = songs.length > 0

  return (
    <>
      {hasAnything && (
        <div className="filters">
          <Chips label="Mine" filters={filters.mine} active={activeFilter} onPick={onFilter} />
          <Chips label="Auto" filters={filters.auto} active={activeFilter} onPick={onFilter} />
          <button
            type="button"
            className="random"
            onClick={onRandom}
            disabled={visible.length === 0}
            title={
              activeFilter ? 'Open a random song from this group' : 'Open a random song'
            }
          >
            <span className="random-glyph">🎲</span>
            {activeFilter ? `Random from ${filters.activeLabel}` : 'Random song'}
          </button>
        </div>
      )}

      {!hasAnything && (
        <p className="empty">
          Nothing saved yet. Analyse a song and it&apos;ll show up here for instant replay.
        </p>
      )}

      {hasAnything && visible.length === 0 && (
        <p className="empty">Nothing in this group.</p>
      )}

      <ul className="library">
        {visible.map((song) => (
          <li
            key={song.id}
            className={song.id === currentId ? 'library-item current' : 'library-item'}
          >
            <button type="button" className="library-open" onClick={() => onOpen(song.id)}>
              {song.thumbnail ? (
                <img src={song.thumbnail} alt="" loading="lazy" />
              ) : (
                <div className="thumb-placeholder" />
              )}
              <span className="library-text">
                <strong>{song.title}</strong>
                <span className="library-meta">
                  {/* The key is the thing being guessed -- printing it here would
                      give the answer away before the song is even opened. */}
                  {hideKey ? '' : `${song.key.name} · `}
                  {formatDuration(song.full_duration ?? song.duration)}
                  {song.category ? ` · ${song.category}` : ''}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="library-delete"
              title="Remove from library"
              onClick={() => onDelete(song.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
