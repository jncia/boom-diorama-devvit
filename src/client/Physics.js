// ─────────────────────────────────────────────
//  Physics — particle simulation
// ─────────────────────────────────────────────
import {
  GRID_W, GRID_H, GRID_D, GROUND_Y,
  GRAVITY, AIR_DRAG, BOUNCE_ENERGY,
  PARTICLE_LIFETIME, MAX_DEBRIS,
  PARTICLE_SCALE_MIN, PARTICLE_SCALE_MAX,
  SHOCKWAVE_FALLOFF_EXP, UNDERGROUND_UPWARD_BOOST,
} from './constants.js'

let _uid = 0

export function makeParticle(x, y, z, vx, vy, vz, color, size) {
  return {
    id: _uid++,
    x, y, z,
    vx, vy, vz,
    color,
    size,
    rx: 0, ry: 0, rz: 0,          // rotation (Euler, radians)
    wrx: (Math.random()-0.5)*12,    // angular velocity
    wry: (Math.random()-0.5)*12,
    wrz: (Math.random()-0.5)*12,
    age: 0,
    lifetime: PARTICLE_LIFETIME * (0.7 + Math.random() * 0.6),
    // Rigid = stays full size, doesn't fade, shatters on collision instead of bouncing.
    // Used for toppling structure voxels — they fall whole, then break when they hit something.
    rigid: false,
    _dead: false,
  }
}

/** Spawn a small burst of shards around a point (used when a rigid particle shatters). */
function _shatterAt(x, y, z, color, size, particles) {
  const n = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n && particles.length < MAX_DEBRIS; i++) {
    const vx = (Math.random() - 0.5) * 6
    const vy = Math.random() * 4
    const vz = (Math.random() - 0.5) * 6
    const sz = 0.18 + Math.random() * 0.22
    particles.push(makeParticle(x, y, z, vx, vy, vz, color, sz))
  }
}

/**
 * Spawn debris for a single voxel that just broke apart.
 * Produces one "chunk" (~2/3 voxel size) + several "shards" — looks like the
 * voxel actually fractured rather than popping out dust.
 *
 * Velocity uses cubic distance falloff (see SHOCKWAVE_FALLOFF_EXP) so close-in
 * voxels scream and edge voxels just tumble. Underground blasts get an extra
 * upward kick so they erupt out of the ground.
 */
export function spawnVoxelBreak(v, cx, cy, cz, maxR, densityMult, particles) {
  if (particles.length >= MAX_DEBRIS) return

  const vcx = v.x + 0.5, vcy = v.y + 0.5, vcz = v.z + 0.5
  const dx = vcx - cx, dy = vcy - cy, dz = vcz - cz
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1
  const nx = dx / len, ny = dy / len, nz = dz / len

  // Cubic falloff: 1 at center, 0 at maxR (user-requested r^3 deterioration)
  const distN  = Math.min(1, len / Math.max(1, maxR))
  const energy = Math.pow(1 - distN, SHOCKWAVE_FALLOFF_EXP)
  const baseSpeed = 5 + 40 * energy

  // Underground? give an upward erupt-from-ground bias.
  // Bias grows with bomb depth below surface — up to ~UNDERGROUND_UPWARD_BOOST.
  const underground = cy < GROUND_Y
  const depthFrac   = underground ? Math.min(1, (GROUND_Y - cy) / 12) : 0
  const upBias      = depthFrac * UNDERGROUND_UPWARD_BOOST * (0.3 + energy)

  const chunkSize = 0.55 + Math.random() * 0.22
  const shardCount = Math.max(1, Math.round((2 + Math.random() * 2.2) * densityMult))

  const emit = (size, speedMult, spread, rotateFast) => {
    if (particles.length >= MAX_DEBRIS) return
    const sp = baseSpeed * speedMult * (0.55 + Math.random() * 0.9)
    // Slight upward tilt on the radial direction so nothing spawns pointing exactly sideways
    const vx = (nx + (Math.random() - 0.5) * spread) * sp
    let   vy = (ny + (Math.random() - 0.5) * spread) * sp + 2 * energy
    vy += upBias * sp * (0.6 + Math.random() * 0.7)
    const vz = (nz + (Math.random() - 0.5) * spread) * sp

    const p = makeParticle(
      vcx + (Math.random() - 0.5) * 0.18,
      vcy + (Math.random() - 0.5) * 0.18,
      vcz + (Math.random() - 0.5) * 0.18,
      vx, vy, vz, v.color, size,
    )
    if (rotateFast) {
      p.wrx *= 1.8; p.wry *= 1.8; p.wrz *= 1.8
    }
    particles.push(p)
  }

  // Main chunk — big, moderate speed, looks like the voxel itself tumbling
  emit(chunkSize, 0.55, 0.28, false)

  // Shards — smaller, faster, wider spread, fast rotation
  for (let i = 0; i < shardCount; i++) {
    const size = PARTICLE_SCALE_MIN + Math.random() * (PARTICLE_SCALE_MAX - PARTICLE_SCALE_MIN) * 0.7
    emit(size, 1.15, 0.85, true)
  }
}

/** @deprecated retained for callers that still pass an array of voxels. */
export function spawnDebris(cx, cy, cz, radius, voxels, densityMult, particles) {
  for (const v of voxels) spawnVoxelBreak(v, cx, cy, cz, radius, densityMult, particles)
}

/**
 * Apply an impulse to every existing particle within the blast sphere, pushing
 * it outward from (cx,cy,cz). Enables multi-bomb physics interaction: debris
 * from one bomb gets slammed by a second bomb's shockwave.
 *
 * Falls off quadratically (1/r²) so close particles get massive kicks, distant
 * ones barely feel it. Rigid (toppling) voxels are affected too — a well-placed
 * second bomb can launch a falling wall clear across the diorama.
 *
 * strengthMult scales the total impulse; used by the Shockwave Force upgrade.
 */
export function applyShockwaveImpulse(cx, cy, cz, radius, particles, strengthMult = 1) {
  const reach    = radius * 2.2           // impulse carries past the voxel-break radius
  const reach2   = reach * reach
  const basePeak = radius * 18 * strengthMult

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz
    const d2 = dx*dx + dy*dy + dz*dz
    if (d2 > reach2 || d2 < 0.25) continue

    const d    = Math.sqrt(d2)
    // Inverse-square falloff, capped close to the center so we don't divide by ~0
    const kick = basePeak / (1 + d * d * 0.6)

    // Rigid (solid voxel) particles are heavier — reduce kick so they don't fly to the moon
    const m = p.rigid ? 0.35 : 1.0

    p.vx += (dx / d) * kick * m
    p.vy += (dy / d) * kick * m
    p.vz += (dz / d) * kick * m

    // Add some spin wobble so it reads as "punched by a wave"
    p.wrx += (Math.random() - 0.5) * kick * 0.15 * m
    p.wry += (Math.random() - 0.5) * kick * 0.15 * m
    p.wrz += (Math.random() - 0.5) * kick * 0.15 * m
  }
}

export function stepParticles(particles, world, dt) {
  const dead = []
  const bursts = []  // {x,y,z,color,size} to spawn after the main loop (rigid shatters)

  const len0 = particles.length
  for (let i = 0; i < len0; i++) {
    const p = particles[i]
    if (p._dead) { dead.push(i); continue }
    p.age += dt
    // Rigid particles live longer (~4× base lifetime) so toppled-and-resting voxels
    // stay in the scene through subsequent explosions before fading out.
    const maxAge = p.rigid ? p.lifetime * 4 : p.lifetime
    if (p.age >= maxAge) { dead.push(i); continue }

    // Apply gravity + drag
    p.vy -= GRAVITY * dt
    const drag = 1 - AIR_DRAG * dt * 60
    p.vx *= drag; p.vy *= drag; p.vz *= drag

    // Integrate
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.z += p.vz * dt

    // Spin
    p.rx += p.wrx * dt
    p.ry += p.wry * dt
    p.rz += p.wrz * dt

    const hs = p.size * 0.5
    let   collided = false

    // ── Wall bounces (6 cube walls) ────────
    if (p.x < hs)          { p.x = hs;           p.vx = Math.abs(p.vx) * BOUNCE_ENERGY; _damp(p); collided = true }
    if (p.x > GRID_W - hs) { p.x = GRID_W - hs;  p.vx = -Math.abs(p.vx) * BOUNCE_ENERGY; _damp(p); collided = true }
    if (p.y < hs)          { p.y = hs;           p.vy = Math.abs(p.vy) * BOUNCE_ENERGY; _damp(p); collided = true }
    if (p.y > GRID_H - hs) { p.y = GRID_H - hs;  p.vy = -Math.abs(p.vy) * BOUNCE_ENERGY; _damp(p); collided = true }
    if (p.z < hs)          { p.z = hs;           p.vz = Math.abs(p.vz) * BOUNCE_ENERGY; _damp(p); collided = true }
    if (p.z > GRID_D - hs) { p.z = GRID_D - hs;  p.vz = -Math.abs(p.vz) * BOUNCE_ENERGY; _damp(p); collided = true }

    // ── Voxel collision (AABB vs grid) ─────
    const gx = Math.floor(p.x), gy = Math.floor(p.y), gz = Math.floor(p.z)
    if (world.isOccupied(gx, gy, gz)) {
      p.x -= p.vx * dt * 1.5
      p.y -= p.vy * dt * 1.5
      p.z -= p.vz * dt * 1.5
      p.vx *= -BOUNCE_ENERGY
      p.vy *= -BOUNCE_ENERGY
      p.vz *= -BOUNCE_ENERGY
      _damp(p)
      collided = true
    }

    // ── Rigid particles shatter on impact ──
    // Require a *real* collision with meaningful impact speed — otherwise a voxel
    // sitting on the ground would shatter repeatedly on tiny floor-rest jitter.
    if (p.rigid && collided) {
      const speed2 = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz
      if (speed2 > 4) {   // only shatter when the impact actually had energy
        bursts.push({ x: p.x, y: p.y, z: p.z, color: p.color, size: p.size })
        p._dead = true
        dead.push(i)
      } else {
        // Rest on the surface — kill motion, keep the voxel sitting there
        p.vx *= 0.3; p.vz *= 0.3
        p.wrx *= 0.5; p.wry *= 0.5; p.wrz *= 0.5
      }
    }
  }

  // Spawn shatter bursts now that we're outside the main loop
  for (const b of bursts) _shatterAt(b.x, b.y, b.z, b.color, b.size, particles)

  // Remove dead particles (reverse order to keep indices valid)
  for (let i = dead.length - 1; i >= 0; i--) {
    particles.splice(dead[i], 1)
  }
}

function _damp(p) {
  p.wrx *= 0.85
  p.wry *= 0.85
  p.wrz *= 0.85
}
