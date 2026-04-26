// ─────────────────────────────────────────────
//  BOOM DIORAMA — constants.js
// ─────────────────────────────────────────────

export const GRID_W = 40   // X
export const GRID_H = 40   // Y (up)
export const GRID_D = 40   // Z

export const GROUND_Y = 18      // Y index of grass/surface layer
export const UNDERGROUND_TOP = 17  // highest underground layer

// The front-left quadrant (x < CUT, z < CUT) is the cross-section cutaway
export const CUT = 20

// Camera / render
export const FRUSTUM_BASE = 30    // ortho half-height in world units — smaller = more zoomed in
export const CAM_DIST = 120

// Physics
export const GRAVITY = 22         // world units/s²
export const AIR_DRAG = 0.018     // fraction lost per frame at 60fps
export const BOUNCE_ENERGY = 0.45 // velocity retained on wall bounce
export const PARTICLE_SCALE_MIN = 0.25
export const PARTICLE_SCALE_MAX = 0.55
export const PARTICLE_LIFETIME = 4.5  // seconds before fade
export const MAX_DEBRIS = 12000

// ─── Shockwave destruction (time-based) ─────────
// How long the destruction wavefront takes to reach maxR. Destruction itself is
// scaled by dt*timeScale so slo-mo naturally stretches this.
export const SHOCKWAVE_DESTROY_DURATION = 0.32
// Speed falloff exponent (user request: r^3 deterioration). 1 = linear, 3 = cubic.
export const SHOCKWAVE_FALLOFF_EXP = 3
// When bomb center is below ground, multiply upward velocity of spawned particles by this.
export const UNDERGROUND_UPWARD_BOOST = 1.8

// Slowmo — lingers so the player can admire the physics
export const SLOWMO_DURATION = 1.2    // seconds at slow speed
export const SLOWMO_FACTOR   = 0.18
export const SLOWMO_RAMP     = 1.4    // seconds to ramp back to 1.0

// ─── Puzzle (per-diorama destruction targets) ──
// target % = min(CAP, BASE + (level-1) * STEP). L1 40%, L10 85%, capped.
export const PUZZLE_TARGET_BASE = 0.40
export const PUZZLE_TARGET_STEP = 0.05
export const PUZZLE_TARGET_CAP  = 0.85
export function puzzleTargetPct(puzzleLevel) {
  return Math.min(
    PUZZLE_TARGET_CAP,
    PUZZLE_TARGET_BASE + (puzzleLevel - 1) * PUZZLE_TARGET_STEP,
  )
}
// Reward when a diorama is cleared
export const PUZZLE_XP_BONUS  = 40
export const PUZZLE_BUX_BONUS = 25

// Bomb-points budget per puzzle level (grows slowly so later levels stay tight)
export function puzzlePointsBudget(puzzleLevel) {
  return 10 + (puzzleLevel - 1) * 2
}

// ─── Structural physics ─────────────────────────
// Structure auto-topples when <= this fraction of its voxels remain.
export const STRUCTURE_TOPPLE_THRESHOLD = 0.55
// Surface voxel drops into a sinkhole when the underground column below it
// is hollowed past this fraction of its initial material.
export const SINKHOLE_HOLLOW_THRESHOLD = 0.55


// Shockwave
export const SHOCKWAVE_EXPAND = 2.2   // expand speed multiplier vs blast radius
export const SHOCKWAVE_DURATION = 0.7

// Screen shake
export const SHAKE_DECAY = 8.0

// ─── Voxel Types ───────────────────────────────
export const VX = Object.freeze({
  EMPTY:        0,
  BEDROCK:      1,
  STONE:        2,
  DIRT_DARK:    3,
  DIRT_MID:     4,
  DIRT_LIGHT:   5,
  ROCK:         6,
  PIPE:         7,
  SKELETON:     8,
  TREASURE:     9,
  GRASS:        10,
  ROAD:         11,
  ROAD_LINE:    12,
  HOUSE_WALL:   13,
  HOUSE_ROOF:   14,
  HOUSE_DOOR:   15,
  HOUSE_WINDOW: 16,
  FENCE:        17,
  CAR_BODY:     18,
  CAR_WINDOW:   19,
  TREE_TRUNK:   20,
  TREE_LEAF:    21,
  MAILBOX:      22,
  TRASH:        23,
  PEDESTRIAN:   24,
})

// ─── Palette (hex numbers) ────────────────────
export const COLORS = {
  [VX.BEDROCK]:      0x2a2a2a,
  [VX.STONE]:        0x6b6b6b,
  [VX.DIRT_DARK]:    0x4a2c0d,
  [VX.DIRT_MID]:     0x7a4520,
  [VX.DIRT_LIGHT]:   0xa0622a,
  [VX.ROCK]:         0x555555,
  [VX.PIPE]:         0xb87333,
  [VX.SKELETON]:     0xe8e0cc,
  [VX.TREASURE]:     0xd4a017,
  [VX.GRASS]:        0x4a8c2a,
  [VX.ROAD]:         0x383838,
  [VX.ROAD_LINE]:    0xe8d840,
  [VX.HOUSE_WALL]:   0xe8c87a,
  [VX.HOUSE_ROOF]:   0xaa2a22,
  [VX.HOUSE_DOOR]:   0x6b3a1f,
  [VX.HOUSE_WINDOW]: 0x88ccff,
  [VX.FENCE]:        0xd4b483,
  [VX.CAR_BODY]:     0x2288cc,
  [VX.CAR_WINDOW]:   0xaaddff,
  [VX.TREE_TRUNK]:   0x7a4520,
  [VX.TREE_LEAF]:    0x2a7a1a,
  [VX.MAILBOX]:      0xbbbbbb,
  [VX.TRASH]:        0x555566,
  [VX.PEDESTRIAN]:   0xee8844,
}

// ─── XP per voxel type ────────────────────────
export const XP_TABLE = {
  [VX.BEDROCK]:      0,
  [VX.STONE]:        1,
  [VX.DIRT_DARK]:    1,
  [VX.DIRT_MID]:     1,
  [VX.DIRT_LIGHT]:   1,
  [VX.ROCK]:         2,
  [VX.PIPE]:         4,
  [VX.SKELETON]:     6,
  [VX.TREASURE]:     8,
  [VX.GRASS]:        1,
  [VX.ROAD]:         1,
  [VX.ROAD_LINE]:    1,
  [VX.HOUSE_WALL]:   2,
  [VX.HOUSE_ROOF]:   2,
  [VX.HOUSE_DOOR]:   2,
  [VX.HOUSE_WINDOW]: 3,
  [VX.FENCE]:        1,
  [VX.CAR_BODY]:     3,
  [VX.CAR_WINDOW]:   3,
  [VX.TREE_TRUNK]:   2,
  [VX.TREE_LEAF]:    1,
  [VX.MAILBOX]:      1,
  [VX.TRASH]:        1,
  [VX.PEDESTRIAN]:   5,
}
// Bux = roughly half XP
export const BUX_TABLE = Object.fromEntries(
  Object.entries(XP_TABLE).map(([k,v]) => [k, Math.max(0, Math.floor(v / 2))])
)

// ─── Chain-detonation types ────────────────────
// When destroyed by a shockwave, these voxel types trigger a secondary blast
// at their position. Value = secondary blast radius.
export const CHAIN_DETONATION = Object.freeze({
  [VX.CAR_BODY]: 3.5,         // car fuel tank going up
})
export const CHAIN_DETONATION_DELAY = 0.08   // game-time seconds before the secondary fires

// ─── Bomb definitions ────────────────────────
// `cost` is the puzzle-mode point cost per placement (see puzzlePointsBudget)
// `shape` = 'sphere' (default) | 'cylinder' (directional — axis = face normal)
// For cylinder bombs, `baseRadius` is the perpendicular radius and `length` is
// the cylinder length along the hit-face axis.
export const BOMBS = [
  { id: 0, name: 'Firecracker', emoji: '🧨', baseRadius: 2.5, cost: 1,  unlockLevel: 0,  unlockCost: 0,   color: 0xff6622, shape: 'sphere' },
  { id: 1, name: 'M-80',        emoji: '💣', baseRadius: 5.0, cost: 3,  unlockLevel: 3,  unlockCost: 50,  color: 0xffaa00, shape: 'sphere' },
  { id: 2, name: 'Dynamite',    emoji: '🔴', baseRadius: 8.0, cost: 6,  unlockLevel: 6,  unlockCost: 200, color: 0xff2222, shape: 'sphere' },
  { id: 3, name: 'C-4',         emoji: '☢', baseRadius: 13.0, cost: 12, unlockLevel: 10, unlockCost: 500, color: 0xff44ff, shape: 'sphere' },
  // Directional pipe bomb — shaped charge, carves along the face normal
  { id: 4, name: 'Pipe Bomb',   emoji: '🧪', baseRadius: 2.2, cost: 3,  unlockLevel: 4,  unlockCost: 120, color: 0xcc44aa, shape: 'cylinder', length: 14 },
]

// ─── Upgrade definitions ─────────────────────
export const UPGRADES = [
  { id: 'radius_0', name: 'Firecracker Radius +10%', icon: '🧨', bombId: 0, maxLevel: 3, baseCost: 20,  costMult: 1.8 },
  { id: 'radius_1', name: 'M-80 Radius +10%',        icon: '💣', bombId: 1, maxLevel: 3, baseCost: 50,  costMult: 1.8 },
  { id: 'radius_2', name: 'Dynamite Radius +10%',    icon: '🔴', bombId: 2, maxLevel: 3, baseCost: 120, costMult: 1.8 },
  { id: 'radius_3', name: 'C-4 Radius +10%',         icon: '☢',  bombId: 3, maxLevel: 3, baseCost: 300, costMult: 1.8 },
  { id: 'particle_density', name: 'Particle Density +25%', icon: '✨', bombId: -1, maxLevel: 3, baseCost: 80,  costMult: 2 },
  { id: 'multi_bomb',       name: 'Multi-Bomb (up to 3)',  icon: '🎯', bombId: -1, maxLevel: 2, baseCost: 150, costMult: 3 },
  // NEW upgrades — physics depth
  { id: 'shockwave_force',  name: 'Shockwave Force +20%',  icon: '💨', bombId: -1, maxLevel: 4, baseCost: 90,  costMult: 2,
    desc: 'Blasts punch loose debris harder. Lets you juggle debris with multi-bomb.' },
  { id: 'chain_reaction',   name: 'Chain Reaction',         icon: '🔗', bombId: -1, maxLevel: 1, baseCost: 220, costMult: 1,
    desc: "Destroyed cars' fuel tanks detonate on their own." },
  { id: 'budget_boost',     name: 'Bomb Points +2 / level', icon: '🧨', bombId: -1, maxLevel: 3, baseCost: 120, costMult: 1.8,
    desc: 'Adds 2 extra bomb points to every diorama. Stackable.' },
]

// ─── Achievements ────────────────────────────
export const ACHIEVEMENTS = [
  { id: 'first_blood',    name: 'First Blood',         desc: 'Detonate your first bomb',         icon: '💥' },
  { id: 'mailbox_menace', name: 'Mailbox Menace',      desc: 'Destroy 10 mailbox voxels',         icon: '📬' },
  { id: 'car_crusher',    name: 'Car Crusher',          desc: 'Destroy 5 cars (25 car voxels)',   icon: '🚗' },
  { id: 'house_flipper',  name: 'House Flipper',        desc: 'Level a full house',                icon: '🏠' },
  { id: 'going_under',    name: 'Going Underground',   desc: 'Place a bomb below ground',         icon: '⛏' },
  { id: 'particle_storm', name: 'Particle Storm',      desc: 'Destroy 500+ voxels in one blast', icon: '🌪' },
  { id: 'treasure_hunt',  name: 'Treasure Hunter',     desc: 'Unearth the buried treasure',      icon: '💎' },
  { id: 'full_carnage',   name: 'Full Carnage',        desc: 'Earn 1000 XP total',                icon: '☠' },
]

// ─── Level thresholds ────────────────────────
export function xpForLevel(lvl) {
  return Math.floor(100 * Math.pow(1.4, lvl - 1))
}
