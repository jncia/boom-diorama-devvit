# Boom Diorama (Devvit Web)

A voxel destruction puzzle game for Reddit, built on the Devvit Web platform.

The original web version is a self-contained Three.js + Vite project. This is
the Reddit/Devvit port — same Three.js client, wrapped in a Devvit Web shell
with Reddit-authenticated server-side save state and a global leaderboard.

| | |
|---|---|
| Devvit App Directory | https://developers.reddit.com/apps/boom-diorama |
| Test subreddit | https://www.reddit.com/r/boom_diorama_dev |
| Source repo | https://github.com/jncia/boom-diorama-devvit |

## Architecture

```
src/
├── client/        # Three.js webview (HTML + ES modules, bundled by Vite)
│   ├── index.html       Boot overlay, HUD, leaderboard modal, sound toggle
│   ├── main.js          Game loop, hydration, level orchestration
│   ├── api.js           Thin wrapper around /api/* with localhost fallback
│   ├── Progression.js   XP/Bux/unlocks — Redis-backed via /api/save
│   ├── Audio.js         Web Audio synth — defaults to MUTED (mobile policy)
│   ├── UI.js            HUD, menu, level select, shop, achievements
│   └── Renderer/Physics/ExplosionSystem/InputHandler/VoxelWorld/Diorama…
└── server/        # Express server bundled to dist/server/index.cjs
    └── index.js         /api/init, /api/save, /api/reset,
                          /api/puzzle-clear, /api/leaderboard,
                          /internal/menu/create-post
```

The server is bundled to a single CJS file via esbuild (see
`scripts.build:server` in package.json). The client is bundled to a single
ES2020 chunk via Vite. `devvit.json` tells Reddit where to find both.

## Persistence

Two Redis keys, both scoped per-app-install:

- `bd:save:{userId}` — per-user save blob (XP, Bux, level, puzzleLevel,
  unlockedBombs, upgradeLevels, achievements, stats). Capped at 32 KB.
- `bd:leaderboard` — sorted set, member = Reddit username, score = highest
  puzzle level cleared. Updated by `/api/puzzle-clear` only when a personal
  best is reached.

Logged-out users (and local-dev Vite) fall back to localStorage with the
same key (`boomDiorama_v1`). The Progression class debounces server saves
(800 ms) so the game loop never blocks on the network.

## Local development

```bash
npm install
npm run login          # one-time: authenticate the devvit CLI
npm run dev            # client + server watch + devvit playtest
```

`npm run dev` runs three things concurrently:
- `vite build --watch` — re-bundles `dist/client/` on save
- `esbuild --watch` — re-bundles `dist/server/index.cjs` on save
- `devvit playtest` — re-installs the latest version into the test sub on
  every bundle change

The default test sub is `r/boom_diorama_dev` (auto-created by Devvit when we
ran `devvit upload` for the first time). Edit `dev.subreddit` in
`devvit.json` if you want to point at a different one.

## Build & publish

```bash
npm run build           # produces dist/client + dist/server
npm run upload          # private upload (visible only to the app owner)
npm run publish         # request public review (Reddit App Directory listing)
```

`upload` is the right one for early playtesting. `publish` is for once you
want public discoverability — it triggers a 1–2 business day human review.

## How to test the game on Reddit (current dev state)

The app is uploaded and installed on `r/boom_diorama_dev`, but there's no
game post in the sub yet. To create the first one and play:

1. Go to https://www.reddit.com/r/boom_diorama_dev (logged in as u/Benjaminboogers).
2. Look for the moderator menu — it's the **"…"** ("more") icon near the
   subreddit header. Click it.
3. Pick **`[Boom Diorama] Create Post`**. That fires our server's
   `/internal/menu/create-post` endpoint, which calls
   `reddit.submitCustomPost` and spawns a new post titled
   *"🧨 Boom Diorama — voxel destruction puzzle"*.
4. Click the post. The webview iframe loads the bundle in `dist/client/`.
   You'll see the BOOM DIORAMA boot overlay, then the diorama scene,
   then the HUD with `u/Benjaminboogers` shown in the top-right user
   badge — that's how you know the Reddit auth is wired up.
5. Click anywhere on the diorama to drop a bomb. Try to clear the target
   percentage shown in the puzzle widget.
6. Open the menu (**☰**) → **Leaderboard** to see your ranking after
   clearing levels.

Your save state will persist server-side via Redis; rebuilding the page
should bring back your XP, Bux, and level.

## Server endpoints

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/init`         | Returns `{ userId, username, loggedIn, save }` for hydration. |
| `POST` | `/api/save`         | `{ data }` → persist save blob to Redis. |
| `POST` | `/api/reset`        | Drop the user's save and leaderboard entry. |
| `POST` | `/api/puzzle-clear` | `{ puzzleLevel }` → personal-best leaderboard update. |
| `GET`  | `/api/leaderboard`  | Top 20 + caller's rank. |
| `POST` | `/internal/menu/create-post` | Moderator menu: spawn a new game post. |

## Permissions used

- `redis` — per-user save blobs + global leaderboard sorted set.
- `reddit` — read user identity (`context.userId`, `context.username`),
  submit custom posts via `reddit.submitCustomPost()`.

No `http` allowlist (no external API calls), no `realtime`, no `payments`.

## Bundle sizes

| | size | gzip |
|---|---|---|
| Client (Three.js + game) | 530 KB | 138 KB |
| Server (Express + @devvit) | 5.1 MB CJS | n/a (server-side) |

## License

BSD-3-Clause
