# App Directory metadata — copy/paste into developers.reddit.com/apps/boom-diorama

Fields the App Settings page wants. Pre-written so you can just paste.

---

## Tagline (one line, ~10 words)

> Voxel destruction puzzle. Click to bomb. Topple procedural cities.

## Short description (1-2 sentences, App Directory cards)

> A click-to-bomb voxel destruction puzzle. Each diorama is a procedurally
> generated town, city block, or hillside — clear the destruction target
> before you run out of bomb points to advance.

## Long description (App Directory detail page)

> **Boom Diorama** is a click-to-bomb voxel destruction puzzle. Each level
> spawns a procedurally generated diorama — a cottage, a suburb, a city
> block, a downtown skyline — and asks you to destroy a target percentage
> of it before your bomb-point budget runs out.
>
> Detonations send debris flying through a real-time particle system.
> Structures topple when their support is cut. Underground blasts open
> sinkholes that swallow whole columns of the scene.
>
> Earn XP and Bux from each clear. Level up to unlock heavier bombs —
> Firecracker, TNT, C-4, Pipe Bomb. Spend Bux on upgrades: multi-bomb,
> larger blast radius, chain-reaction explosives, structure-toppling shockwave.
>
> Your progress saves to your Reddit account and persists across sessions.
> Clear higher dioramas to climb the global leaderboard.
>
> Built on Devvit Web with Three.js. Works on desktop and mobile. No external
> sites, no accounts — just click anywhere on the scene to bomb.

## Category

> Games

## Tags / keywords (if asked)

> puzzle, destruction, voxel, physics, casual, single-player, leaderboard

## Privacy / data handling notes (if asked)

> Stores per-user game state (XP, level, unlocks, achievements) in Devvit's
> Redis using the Reddit user ID as the key. Stores Reddit username +
> highest puzzle level cleared in a leaderboard sorted set. No other
> personal data collected. No external API calls. Users can reset their
> progress via Settings → Reset All Progress.

## Screenshots (3-4 recommended)

Capture from r/boom_diorama_dev:
1. **Hero shot** — wide isometric view of a multi-building diorama, HUD visible
2. **Mid-detonation** — explosion frame with debris and shockwave
3. **Level Complete overlay** — to show the progression hook
4. **Leaderboard modal** — to show the multiplayer/social hook

`Cmd+Shift+5` → Capture Selection → save PNGs.

## Marketing icon

Already wired: `assets/icon.png` (the BOOM voxel + explosion tile).

---

## When everything's filled in

```bash
cd /Users/bjacobson/Documents/Git/boom-diorama-devvit
npm run build
devvit publish --bump minor --public
```

`--bump minor` takes us from 0.0.1 → 0.1.0 (sensible first-public version).
`--public` triggers Reddit's review for App Directory listing.

Expect 1–2 business days for review. You'll get an email when it's approved.
