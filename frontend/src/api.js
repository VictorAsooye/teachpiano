const BASE = '/api'

// fetch() rejects with a bare TypeError("Failed to fetch") when the request
// never reaches the server at all. That message tells you nothing and reads
// like a bug in the page, when the actual cause is almost always that the
// backend isn't running -- so name the real problem and the fix.
// Two very different situations wear the same error. Running locally, the
// server has stopped and can be restarted. On the hosted site there is no
// server at all by design, and telling a kid on a phone to run a .bat file
// would be nonsense.
const isLocal = () =>
  typeof location !== 'undefined' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

class ServerDownError extends Error {
  constructor() {
    super(
      isLocal()
        ? "Can't reach the Song Decoder server. It has probably stopped — run " +
            'Song Decoder.bat again, and make sure you are on http://127.0.0.1:8420.'
        : 'Song decoding only runs on a computer with the app installed. ' +
            'Everything else on this site works here.',
    )
    this.name = 'ServerDownError'
  }
}

async function request(path, options) {
  let response
  try {
    response = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new ServerDownError()
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body.detail) detail = body.detail
    } catch {
      /* non-JSON error body; keep the generic message */
    }
    throw new Error(detail)
  }
  return response.json()
}

/** Is the analysis server there at all? Everything except song decoding
 *  works without it, so a static-only deployment is a real option. */
export const health = () => request('/health')

export const analyze = (url, force = false) =>
  request('/analyze', { method: 'POST', body: JSON.stringify({ url, force }) })

export const getJob = (jobId) => request(`/jobs/${jobId}`)
export const listSongs = () => request('/songs')
export const getSong = (songId) => request(`/songs/${songId}`)
export const deleteSong = (songId) => request(`/songs/${songId}`, { method: 'DELETE' })

export const setCategory = (songId, category) =>
  request(`/songs/${songId}/category`, { method: 'PUT', body: JSON.stringify({ category }) })
