/**
 * Library filtering and the random picker.
 *
 * Two kinds of group. **Auto** groups fall out of what the analysis already
 * knows, so they work on a library nobody has tagged. **Mine** groups are the
 * user's own words. Both behave identically once built, so the rest of the UI
 * doesn't care which sort it is looking at.
 */

const TEMPO_BANDS = [
  { id: 'auto:slow', label: 'Slow', test: (s) => s.tempo && s.tempo < 90 },
  { id: 'auto:mid', label: 'Mid', test: (s) => s.tempo && s.tempo >= 90 && s.tempo <= 130 },
  { id: 'auto:fast', label: 'Fast', test: (s) => s.tempo && s.tempo > 130 },
]

export const MODE_IDS = new Set(['auto:minor', 'auto:major'])

const AUTO_GROUPS = [
  { id: 'auto:minor', label: 'Minor', test: (s) => s.key?.mode === 'minor' },
  { id: 'auto:major', label: 'Major', test: (s) => s.key?.mode === 'major' },
  ...TEMPO_BANDS,
  // Worth its own chip: these are the ones the app thinks aren't music at all,
  // and you almost always want them out of the way rather than in a practice
  // rotation.
  { id: 'auto:notmusic', label: 'Not music', test: (s) => s.music?.is_music === false },
]

/**
 * Build the chip list for a set of songs.
 *
 * Empty groups are dropped — a "Slow" chip that matches nothing is just noise.
 */
export function buildFilters(songs, { includeMode = true } = {}) {
  const groups = includeMode ? AUTO_GROUPS : AUTO_GROUPS.filter((g) => !MODE_IDS.has(g.id))
  const auto = groups.map((group) => ({
    ...group,
    group: 'auto',
    count: songs.filter(group.test).length,
  })).filter((group) => group.count > 0)

  const counts = new Map()
  for (const song of songs) {
    const name = (song.category || '').trim()
    if (name) counts.set(name, (counts.get(name) || 0) + 1)
  }

  const mine = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      id: `mine:${name}`,
      label: name,
      group: 'mine',
      count,
      test: (song) => (song.category || '').trim() === name,
    }))

  return { mine, auto }
}

export function applyFilter(songs, filterId) {
  if (!filterId) return songs
  const { mine, auto } = buildFilters(songs)
  const match = [...mine, ...auto].find((f) => f.id === filterId)
  return match ? songs.filter(match.test) : songs
}

/**
 * Pick a song at random from `songs`, avoiding the one already open.
 *
 * Without the exclusion a two-song category would hand you the same song
 * roughly half the time, which doesn't feel random — it feels broken.
 */
export function pickRandom(songs, currentId) {
  if (!songs.length) return null
  const others = songs.filter((song) => song.id !== currentId)
  const pool = others.length ? others : songs
  return pool[Math.floor(Math.random() * pool.length)]
}
