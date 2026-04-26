# Boom Diorama (Devvit Web)

A voxel destruction puzzle game for Reddit, built on the Devvit Web platform.

This is the Reddit/Devvit port of Boom Diorama. The original web version uses
Three.js + Vite; this port wraps the same client in a Devvit Web shell with
Reddit-authenticated server-side save state via Redis.

## Architecture

```
src/
├── client/        # Three.js webview (HTML + ES modules)
│   ├── index.html
│   ├── main.js    # game loop & orchestration
│   ├── Renderer.js  Physics.js  ExplosionSystem.js  ...
│   └── Progression.js  # XP/Bux/unlocks (Redis-backed via /api)
├── server/        # Express server bundled to dist/server/index.cjs
│   └── index.js   # /api/save  /api/load  /api/leaderboard  ...
└── shared/        # types/constants reachable from both sides
```

## Local development

```bash
npm install
npm run login          # one-time: authenticate the devvit CLI
npm run dev            # client + server watch + devvit playtest
```

Edit your test subreddit in `devvit.json` (currently `boomdioramadev`).

## Build & publish

```bash
npm run build          # produces dist/client + dist/server
npm run upload         # private upload (visible only to you)
npm run publish        # request public review
```

## Persistence model

- Per-user save (`bd:save:{userId}`) — XP, Bux, level, unlocks, achievements
- Global leaderboard (`bd:leaderboard`) — ZSET keyed on highest puzzle level cleared

Anonymous (logged-out) users get a localStorage save with no leaderboard entry.

## License

BSD-3-Clause
