// ─────────────────────────────────────────────
//  DioramaBuilder — procedural voxel scene
//
//  Structure:
//   - `sceneExtent(puzzleLevel)` → how big the active footprint is (grows with level)
//   - `buildDiorama(world, { seed, puzzleLevel })` picks a TEMPLATE for that
//     level and calls its build() with a `bounds` rectangle
//   - Templates place surface + above-ground content + unique underground features
//     inside `bounds` using helper primitives at the bottom of this file
//   - Everything outside bounds is left empty so the "island" floats in the grid
// ─────────────────────────────────────────────
import { GRID_W, GRID_H, GRID_D, GROUND_Y, VX } from './constants.js'

// ─── PRNG ─────────────────────────────────────
function rng(seed) {
  let s = seed | 0
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1)
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
    return ((s ^ (s >>> 14)) >>> 0) / 4294967295
  }
}

// ─── Scene sizing ─────────────────────────────
// Extent = side length of the active square on the surface. Lower levels get
// tighter scenes (feels intimate), later ones grow to fill the 40³ grid.
export function sceneExtent(puzzleLevel) {
  const MIN = 16, MAX = GRID_W
  return Math.max(MIN, Math.min(MAX, MIN + (puzzleLevel - 1) * 2))
}

function makeBounds(extent) {
  const margin = Math.floor((GRID_W - extent) / 2)
  return {
    x0: margin, xe: margin + extent,
    z0: margin, ze: margin + extent,
    extent,
    cx: margin + extent / 2,
    cz: margin + extent / 2,
  }
}

// ─── Template registry ────────────────────────
// Each template has a minExtent so the dispatcher can pick one that fits.
// Dispatcher cycles through matching templates by puzzleLevel for variety.

const TEMPLATES = []   // filled below after helper defs

// ─── Dispatcher ───────────────────────────────
export function buildDiorama(world, { seed = 42, puzzleLevel = 1 } = {}) {
  world.clear()
  const rand   = rng(seed)
  const extent = sceneExtent(puzzleLevel)
  const bounds = makeBounds(extent)

  // Pick a template that fits this extent. Rotate through them by level so
  // consecutive dioramas feel different even within the same size tier.
  const eligible = TEMPLATES.filter(t => extent >= t.minExtent)
  const tmpl = eligible[(puzzleLevel - 1) % eligible.length] ?? TEMPLATES[0]

  const structures = []
  const record = (kind, fn) => {
    const voxels  = []
    const origSet = world.set.bind(world)
    world.set = (x, y, z, type) => {
      origSet(x, y, z, type)
      voxels.push({ x, y, z })
    }
    try { fn() } finally { world.set = origSet }
    if (voxels.length > 0) structures.push({ kind, voxels, initialCount: voxels.length, toppled: false })
  }

  tmpl.build(world, bounds, rand, { record })

  return { structures, bounds, templateName: tmpl.name }
}

// ═════════════════════════════════════════════
//  LOW-LEVEL HELPERS (bounded, reusable)
// ═════════════════════════════════════════════

/** Fill underground (y=0..GROUND_Y) within bounds with bedrock/stone/dirt layers. */
function fillUnderground(world, b, rand) {
  for (let z = b.z0; z < b.ze; z++) {
    for (let x = b.x0; x < b.xe; x++) {
      for (let y = 0; y < GROUND_Y; y++) {
        let type
        if (y < 3)       type = VX.BEDROCK
        else if (y < 6)  type = VX.STONE
        else if (y < 10) type = rand() < 0.88 ? VX.DIRT_DARK  : VX.ROCK
        else if (y < 14) type = rand() < 0.85 ? VX.DIRT_MID   : VX.ROCK
        else             type = rand() < 0.82 ? VX.DIRT_LIGHT : VX.ROCK
        world.set(x, y, z, type)
      }
    }
  }
}

/** Fill the surface layer with `surfaceType`, leaving a cutaway corner at the
 *  low-x, low-z corner (proportional to extent) to expose underground. */
function fillSurface(world, b, surfaceType = VX.GRASS, cutawayFrac = 0.45) {
  const cut = Math.ceil(b.extent * cutawayFrac)
  for (let z = b.z0; z < b.ze; z++) {
    for (let x = b.x0; x < b.xe; x++) {
      if (x < b.x0 + cut && z < b.z0 + cut) {
        // Carve the cutaway deeper — also empty some upper underground cells so you
        // can see the cross-section, not just the missing grass.
        for (let y = GROUND_Y - 2; y < GROUND_Y; y++) world.destroy(x, y, z)
        continue
      }
      world.set(x, GROUND_Y, z, surfaceType)
    }
  }
}

/** Horizontal road strip spanning the bounds width at depth zCenter ± halfWidth. */
function fillRoad(world, b, zCenter, halfWidth = 1) {
  for (let x = b.x0; x < b.xe; x++) {
    for (let dz = -halfWidth; dz <= halfWidth; dz++) {
      const z = zCenter + dz
      if (z < b.z0 || z >= b.ze) continue
      world.set(x, GROUND_Y, z, VX.ROAD)
    }
    if (x % 5 < 3) world.set(x, GROUND_Y, zCenter, VX.ROAD_LINE)
  }
}

function buildTrashCan(world, x, y, z) {
  world.set(x, y,   z, VX.TRASH)
  world.set(x, y+1, z, VX.TRASH)
  world.set(x, y+2, z, VX.TRASH)
}

function buildCar(world, x, y, z, rand) {
  for (let dx = 0; dx < 5; dx++) {
    for (let dz = 0; dz < 2; dz++) {
      world.set(x+dx, y,   z+dz, VX.CAR_BODY)
      world.set(x+dx, y+1, z+dz, VX.CAR_BODY)
    }
  }
  for (let dx = 1; dx < 4; dx++) {
    for (let dz = 0; dz < 2; dz++) world.set(x+dx, y+2, z+dz, VX.CAR_BODY)
  }
  world.set(x+2, y+2, z,   VX.CAR_WINDOW)
  world.set(x+2, y+2, z+1, VX.CAR_WINDOW)
  world.set(x+1, y+1, z,   VX.CAR_WINDOW)
  world.set(x+3, y+1, z,   VX.CAR_WINDOW)
}

function buildTree(world, x, y, z, rand) {
  world.set(x, y,   z, VX.TREE_TRUNK)
  world.set(x, y+1, z, VX.TREE_TRUNK)
  world.set(x, y+2, z, VX.TREE_TRUNK)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 0; dy < 4; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 1) < 4 && rand() > 0.25)
          world.set(x+dx, y+2+dy, z+dz, VX.TREE_LEAF)
      }
    }
  }
  world.set(x, y+5, z, VX.TREE_LEAF)
}

function buildHouse(world, ox, oy, oz) {
  const W = 9, H = 8, D = 8
  for (let dx = 0; dx < W; dx++) {
    for (let dz = 0; dz < D; dz++) {
      for (let dy = 0; dy < H - 2; dy++) {
        const isPerimeter = dx === 0 || dx === W-1 || dz === 0 || dz === D-1
        if (isPerimeter) world.set(ox+dx, oy+dy, oz+dz, VX.HOUSE_WALL)
        if (dy === 0)    world.set(ox+dx, oy+dy, oz+dz, VX.HOUSE_WALL)
      }
    }
  }
  world.set(ox+2, oy+2, oz, VX.HOUSE_WINDOW)
  world.set(ox+2, oy+3, oz, VX.HOUSE_WINDOW)
  world.set(ox+6, oy+2, oz, VX.HOUSE_WINDOW)
  world.set(ox+6, oy+3, oz, VX.HOUSE_WINDOW)
  world.set(ox+4, oy+0, oz, VX.HOUSE_DOOR)
  world.set(ox+4, oy+1, oz, VX.HOUSE_DOOR)
  world.set(ox+5, oy+0, oz, VX.HOUSE_DOOR)
  world.set(ox+5, oy+1, oz, VX.HOUSE_DOOR)
  for (let layer = 0; layer < 5; layer++) {
    const s = layer, e = W - 1 - layer
    if (s > e) break
    for (let dx = s; dx <= e; dx++) {
      for (let dz = 0; dz < D; dz++) {
        world.set(ox+dx, oy + (H-2) + layer, oz+dz, VX.HOUSE_ROOF)
      }
    }
  }
}

function buildSmallHouse(world, ox, oy, oz) {
  const W = 6, H = 6, D = 6
  for (let dx = 0; dx < W; dx++) {
    for (let dz = 0; dz < D; dz++) {
      for (let dy = 0; dy < H - 2; dy++) {
        const isPerimeter = dx === 0 || dx === W-1 || dz === 0 || dz === D-1
        if (isPerimeter) world.set(ox+dx, oy+dy, oz+dz, VX.HOUSE_WALL)
        if (dy === 0)    world.set(ox+dx, oy+dy, oz+dz, VX.HOUSE_WALL)
      }
    }
  }
  world.set(ox+2, oy+2, oz, VX.HOUSE_WINDOW)
  world.set(ox+4, oy+2, oz, VX.HOUSE_WINDOW)
  world.set(ox+2, oy+0, oz, VX.HOUSE_DOOR)
  world.set(ox+2, oy+1, oz, VX.HOUSE_DOOR)
  for (let layer = 0; layer < 3; layer++) {
    const s = layer, e = W - 1 - layer
    if (s > e) break
    for (let dx = s; dx <= e; dx++)
      for (let dz = 0; dz < D; dz++)
        world.set(ox+dx, oy+(H-2)+layer, oz+dz, VX.HOUSE_ROOF)
  }
}

/** Tall concrete/glass building — W × H × D. Windows tile as a checkerboard
 *  across every other floor on all four faces. Floor voxels form a solid base. */
function buildTallBuilding(world, ox, oy, oz, W, H, D) {
  for (let dx = 0; dx < W; dx++) {
    for (let dz = 0; dz < D; dz++) {
      const isPerim = dx === 0 || dx === W-1 || dz === 0 || dz === D-1
      for (let dy = 0; dy < H; dy++) {
        if (dy === 0) {
          world.set(ox+dx, oy+dy, oz+dz, VX.HOUSE_WALL)   // solid ground floor
        } else if (isPerim) {
          const useWindow = (dy % 2 === 1) && ((dx + dz) % 2 === 0)
          world.set(ox+dx, oy+dy, oz+dz, useWindow ? VX.HOUSE_WINDOW : VX.HOUSE_WALL)
        }
      }
    }
  }
  // Flat roof cap
  for (let dx = 0; dx < W; dx++)
    for (let dz = 0; dz < D; dz++)
      world.set(ox+dx, oy+H, oz+dz, VX.HOUSE_ROOF)
}

function buildLampPost(world, x, y, z) {
  for (let dy = 0; dy < 5; dy++) world.set(x, y+dy, z, VX.FENCE)
  world.set(x+1, y+4, z, VX.FENCE)
  world.set(x+1, y+5, z, VX.ROAD_LINE)
}

function buildPedestrian(world, x, y, z) {
  world.set(x, y,   z, VX.PEDESTRIAN)
  world.set(x, y+1, z, VX.PEDESTRIAN)
  world.set(x, y+2, z, VX.PEDESTRIAN)
  world.set(x, y+3, z, VX.PEDESTRIAN)
  world.set(x+1, y+3, z, VX.PEDESTRIAN)
  world.set(x, y+4, z, VX.PEDESTRIAN)
  world.set(x+1, y+4, z, VX.PEDESTRIAN)
}

function buildMailbox(world, x, y, z) {
  world.set(x, y,   z, VX.MAILBOX)
  world.set(x, y+1, z, VX.MAILBOX)
  world.set(x+1, y+1, z, VX.MAILBOX)
}

/** Buried skeleton scatter near the cutaway edge. */
function buildSkeleton(world, x, y, z) {
  for (const [dx, dy, dz] of [
    [0,0,0],[1,0,0],[0,0,1],[0,1,0],[1,1,0],[0,1,1],
  ]) world.set(x+dx, y+dy, z+dz, VX.SKELETON)
}

/** Treasure chest (2×2×2). */
function buildTreasure(world, x, y, z) {
  for (const [dx, dy, dz] of [
    [0,0,0],[1,0,0],[0,1,0],[1,1,0],
    [0,0,1],[1,0,1],[0,1,1],[1,1,1],
  ]) world.set(x+dx, y+dy, z+dz, VX.TREASURE)
}

/** Hollow a subway tunnel along the Z axis at y0..y0+H, carved out at depth. */
function buildSubway(world, b, xCenter, yFloor, H = 4) {
  for (let z = b.z0 + 1; z < b.ze - 1; z++) {
    for (let dy = 0; dy < H; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        world.destroy(xCenter + dx, yFloor + dy, z)
      }
    }
    // Rail lines on the floor
    world.set(xCenter - 1, yFloor, z, VX.PIPE)
    world.set(xCenter + 1, yFloor, z, VX.PIPE)
    // Occasional pillar
    if (z % 4 === 0) {
      for (let dy = 0; dy < H; dy++) world.set(xCenter, yFloor + dy, z, VX.STONE)
    }
  }
}

/** Underground parking garage — wider cavern with support columns. */
function buildGarage(world, b, rand) {
  const y0 = 6, y1 = 14
  const pad = 2
  for (let z = b.z0 + pad; z < b.ze - pad; z++) {
    for (let x = b.x0 + pad; x < b.xe - pad; x++) {
      for (let y = y0; y < y1; y++) world.destroy(x, y, z)
    }
  }
  // Support pillars on a 5-cell grid
  for (let z = b.z0 + 4; z < b.ze - 4; z += 5) {
    for (let x = b.x0 + 4; x < b.xe - 4; x += 5) {
      for (let y = y0; y < y1; y++) world.set(x, y, z, VX.STONE)
    }
  }
  // A few parked voxel cars inside
  buildCar(world, b.x0 + 5, y0, b.z0 + 6, rand)
  buildCar(world, b.x0 + 12, y0, b.z0 + 10, rand)
}

/** Crystal geode — cluster of colored TREASURE voxels in a small cavern. */
function buildGeode(world, cx, cy, cz, rand) {
  // Carve small cavity
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx*dx + dy*dy + dz*dz <= 6) world.destroy(cx+dx, cy+dy, cz+dz)
      }
    }
  }
  // Crystal cluster
  for (let i = 0; i < 10; i++) {
    const dx = Math.floor((rand() - 0.5) * 4)
    const dy = Math.floor((rand() - 0.5) * 2)
    const dz = Math.floor((rand() - 0.5) * 4)
    world.set(cx+dx, cy+dy, cz+dz, VX.TREASURE)
  }
}

/** Pipe line running along X. */
function buildPipeX(world, xFrom, xTo, y, z) {
  for (let x = xFrom; x < xTo; x++) world.set(x, y, z, VX.PIPE)
}
/** Pipe line running along Z. */
function buildPipeZ(world, x, y, zFrom, zTo) {
  for (let z = zFrom; z < zTo; z++) world.set(x, y, z, VX.PIPE)
}

// ═════════════════════════════════════════════
//  TEMPLATES
// ═════════════════════════════════════════════

/** Small cottage with garden, one tree, mailbox. Underground has basic pipes + pet skeleton + treasure. */
TEMPLATES.push({
  name: 'Cottage',
  minExtent: 16,
  build(world, b, rand, { record }) {
    fillUnderground(world, b, rand)
    fillSurface(world, b, VX.GRASS, 0.45)

    // Simple garden path of road strips
    const pathZ = b.z0 + 3
    for (let x = b.x0 + 4; x < b.xe - 4; x++) world.set(x, GROUND_Y, pathZ, VX.ROAD)

    // Cottage near the back
    const hx = b.x0 + Math.floor(b.extent / 2) - 3
    const hz = b.z0 + b.extent - 8
    record('smallhouse', () => buildSmallHouse(world, hx, GROUND_Y + 1, hz))

    // Tree + mailbox + trash
    record('tree', () => buildTree(world, b.x0 + b.extent - 4, GROUND_Y + 1, b.z0 + 5, rand))
    buildMailbox(world, b.x0 + 3, GROUND_Y + 1, pathZ - 1)
    buildTrashCan(world, b.xe - 3, GROUND_Y + 1, b.ze - 3)

    // Underground — pipes + treasure + skeleton in cutaway
    buildPipeZ(world, b.x0 + 4, 9, b.z0 + 1, b.ze - 1)
    buildPipeX(world, b.x0 + 1, b.xe - 1, 13, b.z0 + Math.floor(b.extent / 2))
    buildSkeleton(world, b.x0 + 2, 11, b.z0 + 2)
    buildTreasure(world, b.x0 + 1, 7, b.z0 + 3)
  },
})

/** The classic suburb — 2 houses, road with cars, trees, pedestrians. Underground: sewer pipes + skeleton + treasure. */
TEMPLATES.push({
  name: 'Suburb',
  minExtent: 22,
  build(world, b, rand, { record }) {
    fillUnderground(world, b, rand)
    fillSurface(world, b, VX.GRASS, 0.42)

    // Road runs across the scene
    const roadZ = b.z0 + Math.floor(b.extent * 0.45)
    fillRoad(world, b, roadZ, 1)

    // Fence between road and far yards
    const fx = b.x0 + Math.floor(b.extent / 2)
    for (let z = roadZ + 3; z < b.ze - 2; z++) {
      world.set(fx, GROUND_Y + 1, z, VX.FENCE)
      world.set(fx, GROUND_Y + 2, z, VX.FENCE)
      if (z % 4 === 0) world.set(fx, GROUND_Y + 3, z, VX.FENCE)
    }

    // Mailbox + trash near the street
    buildMailbox(world, b.x0 + 3, GROUND_Y + 1, roadZ + 3)
    buildTrashCan(world, b.x0 + 5, GROUND_Y + 1, roadZ + 3)
    buildTrashCan(world, b.x0 + 7, GROUND_Y + 1, roadZ + 3)

    // Cars on the road
    record('car', () => buildCar(world, b.x0 + 4, GROUND_Y + 1, roadZ - 1, rand))
    record('car', () => buildCar(world, b.xe - 9, GROUND_Y + 1, roadZ - 1, rand))

    // Trees
    record('tree', () => buildTree(world, b.x0 + b.extent - 5, GROUND_Y + 1, roadZ + 4, rand))
    record('tree', () => buildTree(world, b.x0 + b.extent - 3, GROUND_Y + 1, b.ze - 3, rand))
    record('tree', () => buildTree(world, b.x0 + 4, GROUND_Y + 1, b.ze - 3, rand))

    // Houses
    record('house',      () => buildHouse     (world, b.x0 + 4,  GROUND_Y + 1, roadZ + 5))
    record('smallhouse', () => buildSmallHouse(world, b.xe - 8, GROUND_Y + 1, roadZ + 6))

    // Fire hydrant + lamp posts
    world.set(b.x0 + 2, GROUND_Y + 1, roadZ + 2, VX.PIPE)
    world.set(b.x0 + 2, GROUND_Y + 2, roadZ + 2, VX.PIPE)
    buildLampPost(world, b.x0 + 2,  GROUND_Y + 1, roadZ - 3)
    buildLampPost(world, b.x0 + Math.floor(b.extent / 2), GROUND_Y + 1, roadZ - 3)

    // Pedestrians
    buildPedestrian(world, b.x0 + 3,  GROUND_Y + 1, roadZ + 2)
    buildPedestrian(world, b.xe - 4,  GROUND_Y + 1, roadZ - 2)

    // Underground — sewer mains + skeleton + treasure
    buildPipeZ(world, b.x0 + 5, 9, b.z0, b.ze)
    buildPipeX(world, b.x0, b.xe, 13, b.z0 + Math.floor(b.extent * 0.5))
    buildSkeleton(world, b.x0 + 2, 11, b.z0 + 2)
    buildTreasure(world, b.x0 + 1, 7, b.z0 + 4)
  },
})

/** City block with 3-4 tall buildings, wider road, more cars. Underground: subway tunnel with rails. */
TEMPLATES.push({
  name: 'City Block',
  minExtent: 28,
  build(world, b, rand, { record }) {
    fillUnderground(world, b, rand)
    fillSurface(world, b, VX.ROAD, 0.35)   // concrete plaza style — use road colour as "pavement"

    // A main avenue
    const roadZ = b.z0 + Math.floor(b.extent * 0.55)
    fillRoad(world, b, roadZ, 2)

    // Towers of varying heights along the far side
    const towers = [
      { w: 5, h: 10, d: 5, x: b.x0 + 4 },
      { w: 6, h: 14, d: 6, x: b.x0 + 11 },
      { w: 5, h: 9,  d: 5, x: b.x0 + 19 },
    ]
    if (b.extent >= 32) towers.push({ w: 6, h: 16, d: 6, x: b.x0 + 26 })
    const towerZ = b.ze - 10
    for (const t of towers) {
      if (t.x + t.w > b.xe - 1) continue
      record('house', () => buildTallBuilding(world, t.x, GROUND_Y + 1, towerZ, t.w, t.h, t.d))
    }

    // Cars on the main road (more of them)
    record('car', () => buildCar(world, b.x0 + 3,  GROUND_Y + 1, roadZ - 1, rand))
    record('car', () => buildCar(world, b.x0 + 12, GROUND_Y + 1, roadZ - 1, rand))
    record('car', () => buildCar(world, b.x0 + 20, GROUND_Y + 1, roadZ + 1, rand))
    if (b.extent >= 30) record('car', () => buildCar(world, b.xe - 8, GROUND_Y + 1, roadZ - 1, rand))

    // Lamp posts + pedestrians
    buildLampPost(world, b.x0 + 3,  GROUND_Y + 1, roadZ - 3)
    buildLampPost(world, b.x0 + 13, GROUND_Y + 1, roadZ - 3)
    buildLampPost(world, b.x0 + 23, GROUND_Y + 1, roadZ - 3)
    buildPedestrian(world, b.x0 + 5,  GROUND_Y + 1, roadZ - 4)
    buildPedestrian(world, b.x0 + 17, GROUND_Y + 1, roadZ - 4)

    // Underground — subway tunnel + some geodes
    buildSubway(world, b, b.x0 + Math.floor(b.extent / 2), 5, 4)
    buildGeode(world, b.x0 + 4, 11, b.z0 + 3, rand)
    buildSkeleton(world, b.x0 + 2, 11, b.z0 + 5)
  },
})

/** Downtown — skyscrapers + underground parking garage. Only available at top extents. */
TEMPLATES.push({
  name: 'Downtown',
  minExtent: 34,
  build(world, b, rand, { record }) {
    fillUnderground(world, b, rand)
    fillSurface(world, b, VX.ROAD, 0.30)

    // Two perpendicular avenues
    const roadZ1 = b.z0 + Math.floor(b.extent * 0.35)
    const roadZ2 = b.z0 + Math.floor(b.extent * 0.75)
    fillRoad(world, b, roadZ1, 2)
    fillRoad(world, b, roadZ2, 2)

    // Skyscrapers on north block
    const tall = [
      { w: 6, h: 18, d: 6, x: b.x0 + 4,  z: roadZ2 + 3 },
      { w: 7, h: 22, d: 7, x: b.x0 + 13, z: roadZ2 + 3 },
      { w: 6, h: 16, d: 6, x: b.x0 + 22, z: roadZ2 + 3 },
      { w: 6, h: 20, d: 6, x: b.x0 + 30, z: roadZ2 + 3 },
    ]
    for (const t of tall) {
      if (t.x + t.w > b.xe - 1) continue
      if (t.z + t.d > b.ze - 1) continue
      record('house', () => buildTallBuilding(world, t.x, GROUND_Y + 1, t.z, t.w, t.h, t.d))
    }

    // Midrise on south block
    const mid = [
      { w: 5, h: 10, d: 5, x: b.x0 + 4,  z: b.z0 + 3 },
      { w: 6, h: 12, d: 6, x: b.x0 + 11, z: b.z0 + 3 },
      { w: 5, h: 9,  d: 5, x: b.x0 + 20, z: b.z0 + 3 },
      { w: 6, h: 11, d: 6, x: b.x0 + 28, z: b.z0 + 3 },
    ]
    for (const t of mid) {
      if (t.x + t.w > b.xe - 1) continue
      if (t.z + t.d > b.z0 + (roadZ1 - b.z0) - 1) continue
      record('house', () => buildTallBuilding(world, t.x, GROUND_Y + 1, t.z, t.w, t.h, t.d))
    }

    // Street traffic
    for (let x = b.x0 + 3; x < b.xe - 6; x += 8) {
      record('car', () => buildCar(world, x, GROUND_Y + 1, roadZ1 - 1, rand))
      record('car', () => buildCar(world, x + 3, GROUND_Y + 1, roadZ2 + 1, rand))
    }

    // Lamp posts + pedestrians on both avenues
    for (let x = b.x0 + 3; x < b.xe - 3; x += 8) {
      buildLampPost(world, x, GROUND_Y + 1, roadZ1 - 3)
      buildLampPost(world, x, GROUND_Y + 1, roadZ2 + 3)
    }
    buildPedestrian(world, b.x0 + 5, GROUND_Y + 1, roadZ1 + 3)
    buildPedestrian(world, b.x0 + 15, GROUND_Y + 1, roadZ1 - 3)
    buildPedestrian(world, b.x0 + 25, GROUND_Y + 1, roadZ2 - 3)

    // Underground — subway + parking garage + skeleton
    buildSubway(world, b, b.x0 + Math.floor(b.extent * 0.4), 4, 4)
    buildGarage(world, b, rand)
    buildSkeleton(world, b.x0 + 2, 11, b.z0 + 3)
    buildTreasure(world, b.x0 + 1, 7, b.z0 + 5)
    buildGeode(world, b.xe - 4, 11, b.ze - 4, rand)
  },
})
