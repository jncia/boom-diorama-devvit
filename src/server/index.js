// ─────────────────────────────────────────────
//  server — Express app for Boom Diorama (Devvit Web)
//
//  Endpoints:
//    GET  /api/init           → { username, userId, save, loggedIn }
//    POST /api/save           ← { data }   → { ok }
//    POST /api/reset          → { ok }
//    POST /api/puzzle-clear   ← { puzzleLevel }   → { ok, rank, score }
//    GET  /api/leaderboard    → { entries: [{user, score}], you: {rank, score} }
//
//  Internal:
//    POST /internal/menu/create-post   — moderator menu action that creates
//      a new Boom Diorama post in the current subreddit.
// ─────────────────────────────────────────────
import express from 'express'
import {
  context, redis, reddit, createServer, getServerPort,
} from '@devvit/web/server'

const app = express()
app.use(express.json({ limit: '256kb' }))

// ── Redis keys ────────────────────────────────
const SAVE_KEY        = (userId) => `bd:save:${userId}`
const LEADERBOARD_KEY = 'bd:leaderboard'

// ── Helpers ──────────────────────────────────
function getUserContext() {
  // context.userId / context.username are populated by Devvit on every request
  // when the calling user is logged in. They're undefined for logged-out
  // users (and during local Vite dev when calling /api directly).
  const userId   = context.userId   ?? null
  const username = context.username ?? null
  return { userId, username, loggedIn: Boolean(userId && username) }
}

function sanitizeSave(data) {
  // Defensive: cap save blob size at 32 KB before writing to Redis. Boom
  // Diorama's save is ~3 KB JSON so anything beyond this is suspect.
  const json = JSON.stringify(data ?? {})
  if (json.length > 32 * 1024) {
    throw new Error('save payload too large')
  }
  return json
}

// ── /api/init ─────────────────────────────────
app.get('/api/init', async (_req, res) => {
  const { userId, username, loggedIn } = getUserContext()
  let save = null
  if (userId) {
    try {
      const raw = await redis.get(SAVE_KEY(userId))
      if (raw) save = JSON.parse(raw)
    } catch (err) {
      console.warn('init: redis.get failed', err)
    }
  }
  res.json({ userId, username, loggedIn, save })
})

// ── /api/save ─────────────────────────────────
app.post('/api/save', async (req, res) => {
  const { userId } = getUserContext()
  if (!userId) {
    return res.status(401).json({ ok: false, reason: 'not-logged-in' })
  }
  let json
  try { json = sanitizeSave(req.body?.data) }
  catch (err) {
    return res.status(400).json({ ok: false, reason: String(err.message || err) })
  }
  try {
    await redis.set(SAVE_KEY(userId), json)
    res.json({ ok: true })
  } catch (err) {
    console.error('save: redis.set failed', err)
    res.status(500).json({ ok: false })
  }
})

// ── /api/reset ────────────────────────────────
app.post('/api/reset', async (_req, res) => {
  const { userId, username } = getUserContext()
  if (!userId) {
    return res.status(401).json({ ok: false, reason: 'not-logged-in' })
  }
  try {
    await redis.del(SAVE_KEY(userId))
    if (username) {
      await redis.zRem(LEADERBOARD_KEY, [username]).catch(() => {})
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('reset failed', err)
    res.status(500).json({ ok: false })
  }
})

// ── /api/puzzle-clear ─────────────────────────
//  Records the user's highest cleared puzzle level in a Redis ZSET. Lower
//  scores are simply ignored — only personal-bests update the board.
app.post('/api/puzzle-clear', async (req, res) => {
  const { userId, username } = getUserContext()
  if (!userId || !username) {
    return res.status(401).json({ ok: false, reason: 'not-logged-in' })
  }
  const puzzleLevel = Number(req.body?.puzzleLevel)
  if (!Number.isFinite(puzzleLevel) || puzzleLevel < 1 || puzzleLevel > 1000) {
    return res.status(400).json({ ok: false, reason: 'bad-level' })
  }
  try {
    const existing = await redis.zScore(LEADERBOARD_KEY, username)
    if (existing === undefined || existing < puzzleLevel) {
      await redis.zAdd(LEADERBOARD_KEY, { member: username, score: puzzleLevel })
    }
    const newScore = Math.max(existing ?? 0, puzzleLevel)
    const rank = await redis.zRank(LEADERBOARD_KEY, username)
    // zRank gives ascending rank; we want descending (best first).
    const total = await redis.zCard(LEADERBOARD_KEY)
    const descRank = rank === undefined ? null : (total - rank)
    res.json({ ok: true, score: newScore, rank: descRank })
  } catch (err) {
    console.error('puzzle-clear failed', err)
    res.status(500).json({ ok: false })
  }
})

// ── /api/leaderboard ──────────────────────────
app.get('/api/leaderboard', async (_req, res) => {
  try {
    const top = await redis.zRange(LEADERBOARD_KEY, 0, 19, { reverse: true, by: 'rank' })
    const entries = (top ?? []).map(({ member, score }) => ({
      user: member, score: Math.floor(score),
    }))

    let you = null
    const { username } = getUserContext()
    if (username) {
      const score = await redis.zScore(LEADERBOARD_KEY, username)
      if (score !== undefined) {
        const rank  = await redis.zRank(LEADERBOARD_KEY, username)
        const total = await redis.zCard(LEADERBOARD_KEY)
        const descRank = rank === undefined ? null : (total - rank)
        you = { score: Math.floor(score), rank: descRank }
      }
    }

    res.json({ entries, you })
  } catch (err) {
    console.error('leaderboard failed', err)
    res.json({ entries: [], you: null })
  }
})

// ── /internal/menu/create-post ────────────────
//   Triggered by the moderator menu item declared in devvit.json. Spawns a
//   new Boom Diorama post in the active subreddit.
app.post('/internal/menu/create-post', async (_req, res) => {
  try {
    const { subredditName } = context
    if (!subredditName) throw new Error('no subreddit context')
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '🧨 Boom Diorama — voxel destruction puzzle',
      splash: {
        appDisplayName: 'Boom Diorama',
        backgroundUri: undefined,
        buttonLabel: '💥 Play',
        description: 'Click anywhere to place bombs. Hit the destruction target to clear the diorama.',
        heading: 'BOOM DIORAMA',
      },
    })
    res.json({
      navigateTo: post?.url,
      showToast: { text: 'Boom Diorama post created!', appearance: 'success' },
    })
  } catch (err) {
    console.error('create-post failed', err)
    res.status(500).json({
      showToast: { text: 'Failed to create post: ' + (err?.message ?? err), appearance: 'neutral' },
    })
  }
})

// ── Boot ──────────────────────────────────────
const port = getServerPort()
const server = createServer(app)
server.on('error', (err) => console.error('server error', err))
server.listen(port, () => {
  console.log(`[boom-diorama] server listening on :${port}`)
})
