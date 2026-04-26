// ─────────────────────────────────────────────
//  api.js — thin wrapper around the Devvit server
//
//  All server endpoints live under /api/. Requests carry the Reddit user
//  context automatically (no auth headers needed — Devvit injects them).
//  When the page is opened outside a Devvit webview (e.g. local Vite dev
//  server), every call short-circuits to a noop / empty response so the
//  game still runs against localStorage.
// ─────────────────────────────────────────────

// Heuristic: in Devvit, the page is iframed inside reddit.com/redditmedia.com.
// In local dev, the document is top-level and the host is localhost.
const inDevvit = (() => {
  try {
    if (typeof window === 'undefined') return false
    if (window.top === window.self) return false
    const host = window.location.hostname || ''
    if (/localhost|127\.0\.0\.1/.test(host)) return false
    return true
  } catch {
    return true
  }
})()

async function _post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

async function _get(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

export async function getInit() {
  if (!inDevvit) {
    return { username: null, userId: null, save: null, loggedIn: false }
  }
  try {
    return await _get('/api/init')
  } catch (e) {
    console.warn('[api] /api/init failed:', e)
    return { username: null, userId: null, save: null, loggedIn: false }
  }
}

export async function saveProgress(data) {
  if (!inDevvit) return { ok: false, reason: 'not-in-devvit' }
  try {
    return await _post('/api/save', { data })
  } catch (e) {
    console.warn('[api] /api/save failed:', e)
    return { ok: false, reason: 'network' }
  }
}

export async function resetProgress() {
  if (!inDevvit) return { ok: false }
  try {
    return await _post('/api/reset', {})
  } catch (e) {
    console.warn('[api] /api/reset failed:', e)
    return { ok: false }
  }
}

export async function reportPuzzleClear(puzzleLevel) {
  if (!inDevvit) return { ok: false }
  try {
    return await _post('/api/puzzle-clear', { puzzleLevel })
  } catch (e) {
    console.warn('[api] /api/puzzle-clear failed:', e)
    return { ok: false }
  }
}

export async function getLeaderboard() {
  if (!inDevvit) return { entries: [], you: null }
  try {
    return await _get('/api/leaderboard')
  } catch (e) {
    console.warn('[api] /api/leaderboard failed:', e)
    return { entries: [], you: null }
  }
}

export const isInDevvit = inDevvit
