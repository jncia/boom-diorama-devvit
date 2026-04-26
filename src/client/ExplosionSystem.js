// ─────────────────────────────────────────────
//  ExplosionSystem — time-based shockwave destruction
//
//  Design: instead of destroying all voxels in the blast sphere instantly,
//  we enumerate the voxels and sort them by distance from the blast center,
//  then release them over ~SHOCKWAVE_DESTROY_DURATION as the wavefront
//  expands. Each voxel only becomes particles at the moment the wavefront
//  reaches it — so the destruction visually *is* the shockwave.
// ─────────────────────────────────────────────
import {
  COLORS, XP_TABLE, BUX_TABLE, VX, GRID_W, GRID_H, GRID_D,
  SHOCKWAVE_DESTROY_DURATION,
} from './constants.js'
import { spawnVoxelBreak } from './Physics.js'

/**
 * Prepare a shockwave task for a bomb. Sphere shape by default; for directional
 * bombs (Pipe Bomb) pass `shape: 'cylinder'` with `axis: [ax,ay,az]` (unit vector)
 * and `length`. Cylinder extends from the origin `length` units along the axis,
 * with `radius` perpendicular to the axis.
 *
 * Returned task shape: (cx,cy,cz,maxR,duration,t,nextIdx,cells,plannedXp,plannedBux,done)
 */
export function prepareShockwave(cx, cy, cz, radius, world, opts = {}) {
  const duration = opts.duration ?? SHOCKWAVE_DESTROY_DURATION
  const shape    = opts.shape ?? 'sphere'
  const axis     = opts.axis  ?? null
  const length   = opts.length ?? radius

  const cells = []
  let plannedXp = 0, plannedBux = 0

  // Bounding box for either shape
  let ix0, ix1, iy0, iy1, iz0, iz1
  if (shape === 'cylinder' && axis) {
    // Cylinder extends along axis from origin to origin + axis*length, with
    // `radius` perpendicular. Bounding box = convex hull of its end caps.
    const endX = cx + axis[0] * length
    const endY = cy + axis[1] * length
    const endZ = cz + axis[2] * length
    ix0 = Math.max(0, Math.floor(Math.min(cx, endX) - radius))
    ix1 = Math.min(GRID_W - 1, Math.floor(Math.max(cx, endX) + radius) + 1)
    iy0 = Math.max(0, Math.floor(Math.min(cy, endY) - radius))
    iy1 = Math.min(GRID_H - 1, Math.floor(Math.max(cy, endY) + radius) + 1)
    iz0 = Math.max(0, Math.floor(Math.min(cz, endZ) - radius))
    iz1 = Math.min(GRID_D - 1, Math.floor(Math.max(cz, endZ) + radius) + 1)
  } else {
    ix0 = Math.max(0, Math.floor(cx - radius))
    ix1 = Math.min(GRID_W - 1, Math.floor(cx + radius) + 1)
    iy0 = Math.max(0, Math.floor(cy - radius))
    iy1 = Math.min(GRID_H - 1, Math.floor(cy + radius) + 1)
    iz0 = Math.max(0, Math.floor(cz - radius))
    iz1 = Math.min(GRID_D - 1, Math.floor(cz + radius) + 1)
  }

  const r2 = radius * radius

  for (let z = iz0; z <= iz1; z++) {
    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const dz = z + 0.5 - cz

        let dist2
        if (shape === 'cylinder' && axis) {
          // Project onto axis
          const t = dx * axis[0] + dy * axis[1] + dz * axis[2]
          if (t < 0 || t > length) continue
          // Perpendicular distance from the axis line
          const px = dx - t * axis[0]
          const py = dy - t * axis[1]
          const pz = dz - t * axis[2]
          const perp2 = px*px + py*py + pz*pz
          if (perp2 > r2) continue
          // Use position along axis (t) as the wavefront "dist" so the wave
          // propagates outward along the barrel direction, not the radial one.
          dist2 = t * t
        } else {
          dist2 = dx*dx + dy*dy + dz*dz
          if (dist2 > r2) continue
        }

        const type = world.get(x, y, z)
        if (type === VX.EMPTY || type === VX.BEDROCK) continue

        const xp  = XP_TABLE[type]  ?? 0
        const bux = BUX_TABLE[type] ?? 0
        plannedXp  += xp
        plannedBux += bux
        cells.push({
          x, y, z, type,
          color: COLORS[type] ?? 0x888888,
          dist: Math.sqrt(dist2),
          xp, bux,
        })
      }
    }
  }

  cells.sort((a, b) => a.dist - b.dist)

  // For cylinder, the "maxR" the wave front traverses is the length along axis,
  // not the radial radius. This makes stepShockwave's currentR animation sensible.
  const maxR = (shape === 'cylinder' && axis) ? length : radius

  return {
    cx, cy, cz, maxR,
    duration, t: 0, nextIdx: 0,
    cells,
    plannedXp, plannedBux,
    done: cells.length === 0,
    shape, axis, length,
  }
}

/**
 * Advance a shockwave by dt. Destroys cells the wavefront has reached
 * this frame, spawns their break debris, and returns them.
 * Cells already removed by an overlapping shockwave are skipped.
 */
export function stepShockwave(task, world, particles, dt, densityMult = 1) {
  if (task.done) return EMPTY_STEP
  task.t += dt
  const p = Math.min(1, task.t / task.duration)
  // Front moves fastest at first, slower as it nears max radius (easeOut).
  const currentR = task.maxR * (1 - Math.pow(1 - p, 1.8))

  const justDestroyed = []
  let xp = 0, bux = 0

  while (task.nextIdx < task.cells.length) {
    const cell = task.cells[task.nextIdx]
    if (cell.dist > currentR) break
    task.nextIdx++

    // An overlapping shockwave may have destroyed this cell first
    if (world.get(cell.x, cell.y, cell.z) === VX.EMPTY) continue

    world.destroy(cell.x, cell.y, cell.z)
    spawnVoxelBreak(cell, task.cx, task.cy, task.cz, task.maxR, densityMult, particles)
    justDestroyed.push(cell)
    xp  += cell.xp
    bux += cell.bux
  }

  if (task.nextIdx >= task.cells.length || p >= 1) task.done = true
  return { destroyed: justDestroyed, xp, bux, done: task.done, progress: p, currentR }
}

const EMPTY_STEP = Object.freeze({ destroyed: [], xp: 0, bux: 0, done: true, progress: 1, currentR: 0 })

/** Collect voxel type counts for achievement tracking */
export function countTypes(destroyed) {
  const counts = {}
  for (const v of destroyed) {
    counts[v.type] = (counts[v.type] ?? 0) + 1
  }
  return counts
}
