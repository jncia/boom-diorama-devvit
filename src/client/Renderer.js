// ─────────────────────────────────────────────
//  Renderer — Three.js scene, camera, InstancedMesh
// ─────────────────────────────────────────────
import * as THREE from 'three'
import {
  GRID_W, GRID_H, GRID_D, GROUND_Y,
  COLORS, FRUSTUM_BASE, CAM_DIST, MAX_DEBRIS,
} from './constants.js'

const WORLD_CX = GRID_W / 2
const WORLD_CY = GRID_H / 2
const WORLD_CZ = GRID_D / 2

const _matrix = new THREE.Matrix4()
const _pos    = new THREE.Vector3()
const _quat   = new THREE.Quaternion()
const _scale  = new THREE.Vector3()
const _color  = new THREE.Color()

export class Renderer {
  constructor(canvas) {
    // ── Renderer ─────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,   // crisp voxel aesthetic
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = false

    // ── Scene ─────────────────────────────────
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0d0d1a)
    // subtle fog to hide far edge — pushed far enough not to clip underground
    this.scene.fog = new THREE.Fog(0x0d0d1a, 200, 320)

    // ── Orthographic camera — isometric ───────
    this._aspect = window.innerWidth / window.innerHeight
    this._frustum = FRUSTUM_BASE
    this._buildCamera()

    // iso angle: 45° yaw, ~35.26° pitch (arctan(1/√2))
    // Orbit state — position derived from (yaw, pitch, distance, lookAt)
    this._yaw   = Math.PI / 4
    this._pitch = Math.atan(1 / Math.SQRT2)
    this._camDist = CAM_DIST
    this._lookAt = new THREE.Vector3(WORLD_CX, GROUND_Y * 0.55, WORLD_CZ)
    this._updateCameraPos()

    // ── Lights ────────────────────────────────
    const ambient = new THREE.AmbientLight(0xccddff, 0.7)
    this.sun = new THREE.DirectionalLight(0xfff5e0, 0.9)
    this.sun.position.set(1, 2.5, 1)
    this.scene.add(ambient, this.sun)

    // ── Explosion point-lights (pooled, reused per detonation) ──
    this._blastLights = []
    for (let i = 0; i < 4; i++) {
      const L = new THREE.PointLight(0xffaa44, 0, 80, 2)
      L.visible = false
      this.scene.add(L)
      this._blastLights.push({ light: L, t: 0, dur: 0, peak: 0 })
    }
    this._blastLightCursor = 0

    // ── World InstancedMesh ───────────────────
    const voxGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92)
    const voxMat = new THREE.MeshLambertMaterial({ vertexColors: false })
    this._maxWorld = 32000
    this.worldMesh = new THREE.InstancedMesh(voxGeo, voxMat, this._maxWorld)
    this.worldMesh.count = 0
    this.worldMesh.frustumCulled = false
    this.scene.add(this.worldMesh)

    // ── Debris InstancedMesh ──────────────────
    const debGeo = new THREE.BoxGeometry(1, 1, 1) // scaled per particle
    const debMat = new THREE.MeshLambertMaterial({ vertexColors: false })
    this.debrisMesh = new THREE.InstancedMesh(debGeo, debMat, MAX_DEBRIS)
    this.debrisMesh.count = 0
    this.debrisMesh.frustumCulled = false
    this.scene.add(this.debrisMesh)

    // ── Bomb ghost (preview) ──────────────────
    const ghostGeo = new THREE.SphereGeometry(1, 8, 6)
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xff4422, transparent: true, opacity: 0.35, depthWrite: false
    })
    this.ghostMesh = new THREE.Mesh(ghostGeo, ghostMat)
    this.ghostMesh.visible = false
    this.scene.add(this.ghostMesh)

    // Directional bomb ghost — unit cylinder along +Y; we rotate/position at runtime.
    const dirGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false)
    const dirMat = new THREE.MeshBasicMaterial({
      color: 0xcc44aa, transparent: true, opacity: 0.32, depthWrite: false,
    })
    this.ghostDirMesh = new THREE.Mesh(dirGeo, dirMat)
    this.ghostDirMesh.visible = false
    this.scene.add(this.ghostDirMesh)

    // Blast radius ring
    const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.5 })
    this.radiusRing = new THREE.Mesh(ringGeo, ringMat)
    this.radiusRing.visible = false
    this.scene.add(this.radiusRing)

    // ── Shockwave sphere ─────────────────────
    const swGeo = new THREE.SphereGeometry(1, 16, 12)
    const swMat = new THREE.MeshBasicMaterial({
      color: 0xff8822,
      transparent: true,
      opacity: 0.0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.shockwave = new THREE.Mesh(swGeo, swMat)
    this.shockwave.visible = false
    this.scene.add(this.shockwave)
    this._sw = { active: false, t: 0, maxR: 1, duration: 0.7 }

    // ── Multi-bomb markers ────────────────────
    this._bombMarkers = []

    // ── Camera shake ─────────────────────────
    this._shake = 0
    this._shakeOffset = new THREE.Vector3()

    // ── Resize handler ───────────────────────
    window.addEventListener('resize', () => this._onResize())
  }

  _buildCamera() {
    const h = this._frustum
    const w = h * this._aspect
    // near=60: puts the ray origin ~50 world-units from camera (before the grid at ~111 units)
    // far=280: covers the farthest grid corner (~173 units) with margin
    this.camera = new THREE.OrthographicCamera(-w, w, h, -h, 60, 280)
  }

  _onResize() {
    this._aspect = window.innerWidth / window.innerHeight
    const h = this._frustum
    const w = h * this._aspect
    this.camera.left   = -w
    this.camera.right  =  w
    this.camera.top    =  h
    this.camera.bottom = -h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  zoom(delta) {
    this._frustum = Math.max(20, Math.min(120, this._frustum + delta))
    this._onResize()
  }

  /** Auto-fit the ortho frustum to an active scene of side length `extent`. */
  zoomToExtent(extent) {
    // Account for iso projection: diagonal of a square fits best at ~0.7 × side × sqrt(2)
    // Add a little margin so the scene doesn't touch the viewport edge.
    this._frustum = Math.max(20, Math.min(120, extent * 0.85))
    this._onResize()
  }

  _updateCameraPos() {
    const d  = this._camDist
    const cp = Math.cos(this._pitch), sp = Math.sin(this._pitch)
    const sy = Math.sin(this._yaw),   cy = Math.cos(this._yaw)
    this.camera.position.set(
      this._lookAt.x + d * cp * sy,
      this._lookAt.y + d * sp,
      this._lookAt.z + d * cp * cy,
    )
    this.camera.lookAt(this._lookAt)
  }

  /** Rotate camera. dYaw/dPitch in radians. Pitch is clamped to avoid flipping. */
  orbit(dYaw, dPitch) {
    this._yaw += dYaw
    const MIN_P = 0.15
    const MAX_P = Math.PI / 2 - 0.05
    this._pitch = Math.max(MIN_P, Math.min(MAX_P, this._pitch + dPitch))
    this._updateCameraPos()
  }

  /** Pan the look-at point. dxScreen, dyScreen are raw pixel deltas. */
  pan(dxScreen, dyScreen) {
    // World-space right vector: perpendicular to camera forward, on XZ plane.
    const forward = new THREE.Vector3(
      this._lookAt.x - this.camera.position.x,
      0,
      this._lookAt.z - this.camera.position.z,
    ).normalize()
    const right = new THREE.Vector3(forward.z, 0, -forward.x) // rotate 90° in XZ
    // Ortho world units per screen pixel ≈ frustumHeight / viewportHeight
    const scale = (this._frustum * 2) / window.innerHeight
    this._lookAt.x += (-dxScreen * right.x + 0) * scale
    this._lookAt.z += (-dxScreen * right.z + 0) * scale
    this._lookAt.y += dyScreen * scale
    this._updateCameraPos()
  }

  /** Recenter the view on a world-space point (used by buildForCurrentLevel). */
  setLookAt(x, y, z) {
    this._lookAt.set(x, y, z)
    this._updateCameraPos()
  }

  /** Reset orbit to the default isometric framing. */
  resetOrbit() {
    this._yaw   = Math.PI / 4
    this._pitch = Math.atan(1 / Math.SQRT2)
    this._updateCameraPos()
  }

  /** Rebuild InstancedMesh from current voxel world */
  rebuildWorld(world) {
    const active = world.getActive()
    const count  = Math.min(active.length, this._maxWorld)
    this.worldMesh.count = count

    _quat.identity()   // reset — stale rotation from updateDebris would otherwise rotate all voxels
    for (let i = 0; i < count; i++) {
      const { x, y, z, type } = active[i]
      _pos.set(x + 0.5, y + 0.5, z + 0.5)
      _scale.set(1, 1, 1)
      _matrix.compose(_pos, _quat, _scale)
      this.worldMesh.setMatrixAt(i, _matrix)
      _color.setHex(COLORS[type] ?? 0x888888)
      this.worldMesh.setColorAt(i, _color)
    }

    this.worldMesh.instanceMatrix.needsUpdate = true
    if (this.worldMesh.instanceColor) this.worldMesh.instanceColor.needsUpdate = true
    world.dirty = false
  }

  /** Update debris particle InstancedMesh (called every frame) */
  updateDebris(particles) {
    const count = Math.min(particles.length, MAX_DEBRIS)
    this.debrisMesh.count = count

    for (let i = 0; i < count; i++) {
      const p = particles[i]
      // Rigid (toppling voxels): stay full size + colour until the final 15% of life, then fade out.
      let alpha
      if (p.rigid) {
        const maxAge = p.lifetime * 4
        const fadeStart = maxAge * 0.85
        alpha = p.age < fadeStart ? 1 : Math.max(0, 1 - (p.age - fadeStart) / (maxAge - fadeStart))
      } else {
        alpha = Math.min(1, Math.max(0, 1 - p.age / p.lifetime))
      }
      _pos.set(p.x, p.y, p.z)
      const s = p.rigid ? p.size : p.size * alpha
      _scale.set(s, s, s)
      _quat.setFromEuler(new THREE.Euler(p.rx, p.ry, p.rz))
      _matrix.compose(_pos, _quat, _scale)
      this.debrisMesh.setMatrixAt(i, _matrix)
      _color.setHex(p.color).multiplyScalar(p.rigid ? alpha : 0.5 + alpha * 0.5)
      this.debrisMesh.setColorAt(i, _color)
    }

    this.debrisMesh.instanceMatrix.needsUpdate = true
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true
  }

  /** Show/hide bomb placement ghost */
  /** Spherical ghost (default bombs). */
  showGhost(x, y, z, radius, color) {
    this.ghostDirMesh.visible = false
    this.ghostMesh.visible = true
    this.ghostMesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    this.ghostMesh.material.color.setHex(color)

    this.radiusRing.visible = true
    this.radiusRing.position.set(x + 0.5, y + 0.5, z + 0.5)
    this.radiusRing.scale.setScalar(radius)
    // Tilt ring to face camera
    this.radiusRing.lookAt(this.camera.position)
  }

  /** Directional cylinder ghost (Pipe Bomb). `axis` is a [x,y,z] unit vector. */
  showDirectionalGhost(x, y, z, axis, length, radius, color) {
    this.ghostMesh.visible = false
    this.radiusRing.visible = false
    this.ghostDirMesh.visible = true
    const g = this.ghostDirMesh
    // Place the cylinder so its base sits on the hit voxel, extending along axis.
    const midX = x + 0.5 + (axis[0] * length) / 2
    const midY = y + 0.5 + (axis[1] * length) / 2
    const midZ = z + 0.5 + (axis[2] * length) / 2
    g.position.set(midX, midY, midZ)
    // Default cylinder is along +Y; rotate so +Y aligns with `axis`.
    const dir = new THREE.Vector3(axis[0], axis[1], axis[2])
    const up  = new THREE.Vector3(0, 1, 0)
    g.quaternion.setFromUnitVectors(up, dir)
    g.scale.set(radius, length, radius)
    g.material.color.setHex(color)
  }

  hideGhost() {
    this.ghostMesh.visible = false
    this.ghostDirMesh.visible = false
    this.radiusRing.visible = false
  }

  /** Add a persistent placed-bomb marker */
  addBombMarker(x, y, z, color) {
    const geo = new THREE.SphereGeometry(0.6, 6, 4)
    const mat = new THREE.MeshBasicMaterial({ color })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x + 0.5, y + 1.5, z + 0.5)
    this.scene.add(mesh)
    this._bombMarkers.push(mesh)
  }

  clearBombMarkers() {
    this._bombMarkers.forEach(m => this.scene.remove(m))
    this._bombMarkers = []
  }

  /** Trigger shockwave at world position */
  triggerShockwave(x, y, z, radius) {
    this.shockwave.position.set(x + 0.5, y + 0.5, z + 0.5)
    this.shockwave.scale.setScalar(0.1)
    this.shockwave.visible = true
    this._sw = { active: true, t: 0, maxR: radius * 1.4, duration: this._sw.duration }
  }

  /** Bright point-light flash at detonation. Animates to peak then fades. */
  triggerBlastLight(x, y, z, radius) {
    const slot = this._blastLights[this._blastLightCursor]
    this._blastLightCursor = (this._blastLightCursor + 1) % this._blastLights.length
    slot.light.position.set(x + 0.5, y + 0.5, z + 0.5)
    slot.light.distance = radius * 6
    slot.light.color.setHex(0xffbb55)
    slot.light.visible = true
    slot.t    = 0
    slot.dur  = 1.1
    slot.peak = 12 + radius * 1.2
    slot.light.intensity = slot.peak * 0.2   // initial kick (real-time scales up frame 1)
  }

  /** Add shake intensity (call on detonation) */
  addShake(amount) {
    this._shake = Math.min(this._shake + amount, 3)
  }

  render(dt, particles, world) {
    // Rebuild world voxels if dirty
    if (world.dirty) this.rebuildWorld(world)

    // Update debris
    this.updateDebris(particles)

    // Shockwave animation
    if (this._sw.active) {
      this._sw.t += dt
      const p = this._sw.t / this._sw.duration
      if (p >= 1) {
        this.shockwave.visible = false
        this._sw.active = false
      } else {
        const r = this._sw.maxR * p
        this.shockwave.scale.setScalar(r)
        this.shockwave.material.opacity = 0.5 * (1 - p) * (1 - p)
      }
    }

    // Blast light pulses — fast rise, exponential fade; shift hue orange→red as they cool
    for (const slot of this._blastLights) {
      if (!slot.light.visible) continue
      slot.t += dt
      const p = slot.t / slot.dur
      if (p >= 1) { slot.light.visible = false; slot.light.intensity = 0; continue }
      // Rise in first 8%, decay after
      const env = p < 0.08 ? (p / 0.08) : Math.pow(1 - (p - 0.08) / 0.92, 2.2)
      slot.light.intensity = slot.peak * env
      // Cool from yellow-orange to deep red
      const cool = Math.min(1, p * 1.3)
      const r = 1.0
      const g = 0.72 * (1 - cool) + 0.15 * cool
      const b = 0.32 * (1 - cool) + 0.05 * cool
      slot.light.color.setRGB(r, g, b)
    }

    // Screen shake
    if (this._shake > 0.001) {
      const s = this._shake
      this._shakeOffset.set(
        (Math.random() - 0.5) * s,
        (Math.random() - 0.5) * s,
        0
      )
      this.camera.position.add(this._shakeOffset)
      this._shake *= Math.exp(-8 * dt)
    }

    this.renderer.render(this.scene, this.camera)

    // Undo shake (keep logical camera pos stable)
    if (this._shakeOffset.lengthSq() > 0) {
      this.camera.position.sub(this._shakeOffset)
    }
  }

  /** Screen-space to world ray for raycasting */
  screenToRay(nx, ny) {
    // nx,ny in NDC [-1,1]
    const near = new THREE.Vector3(nx, ny, -1).unproject(this.camera)
    const far  = new THREE.Vector3(nx, ny,  1).unproject(this.camera)
    const dir  = far.clone().sub(near).normalize()
    return { origin: near, dir }
  }
}
