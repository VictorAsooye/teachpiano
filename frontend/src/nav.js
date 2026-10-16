/**
 * The site's navigation, in one place.
 *
 * Three groups rather than a long row of tabs, each sub-item carrying a line
 * saying what it does. Lessons link to these by id and read their labels from
 * here, so renaming a section cannot leave a lesson pointing at a name that no
 * longer exists.
 */
export const TABS = [
  { id: 'learn', label: 'Learn the piano' },
  {
    id: 'practice',
    label: 'Practice',
    items: [
      { id: 'keys', label: 'Keys', desc: 'Learn all 24 keys and play each one' },
      { id: 'ear', label: 'Your ear', desc: 'Find the key a singer is in' },
      { id: 'style', label: 'Your style', desc: 'Play, and get tips on how it sounded' },
    ],
  },
  {
    id: 'find',
    label: 'Find a key',
    items: [
      // The only thing here that needs the Python server.
      { id: 'decode', label: 'From a song', desc: 'Paste a YouTube link', needsBackend: true },
      { id: 'live', label: 'From a mic', desc: 'Point it at someone singing live' },
    ],
  },
]

/** Which group a view lives in, so a link can open both at once. */
export const GROUP_OF = {}
for (const group of TABS) {
  if (group.items) for (const item of group.items) GROUP_OF[item.id] = group.id
  else GROUP_OF[group.id] = group.id
}

/** "Practice → Keys", for a button that jumps somewhere. */
export function pathTo(viewId) {
  for (const group of TABS) {
    if (group.id === viewId && !group.items) return group.label
    const item = group.items?.find((i) => i.id === viewId)
    if (item) return `${group.label} → ${item.label}`
  }
  return viewId
}

/** The nav minus anything the running deployment cannot do. */
export function availableTabs(backendUp) {
  if (backendUp !== false) return TABS
  return TABS.map((group) =>
    group.items ? { ...group, items: group.items.filter((i) => !i.needsBackend) } : group,
  ).filter((group) => !group.items || group.items.length)
}
