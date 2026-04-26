// ─────────────────────────────────────────────
//  VoxelWorld — typed-array backed 3D voxel grid
// ─────────────────────────────────────────────
import { GRID_W, GRID_H, GRID_D, VX } from './constants.js'

export class VoxelWorld {
  constructor() {
    // Flat Uint8Array — fast access, low memory
    this._data = new Uint8Array(GRID_W * GRID_H * GRID_D)
    this.dirty = true     // renderer should rebuild InstancedMesh
    this._idx = (x, y, z) => x + y * GRID_W + z * GRID_W * GRID_H
  }

  inBounds(x, y, z) {
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && z >= 0 && z < GRID_D
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return VX.EMPTY
    return this._data[this._idx(x, y, z)]
  }

  set(x, y, z, type) {
    if (!this.inBounds(x, y, z)) return
    this._data[this._idx(x, y, z)] = type
    this.dirty = true
  }

  destroy(x, y, z) {
    if (!this.inBounds(x, y, z)) return VX.EMPTY
    const idx = this._idx(x, y, z)
    const was = this._data[idx]
    this._data[idx] = VX.EMPTY
    if (was !== VX.EMPTY) this.dirty = true
    return was
  }

  isOccupied(x, y, z) {
    return this.get(x, y, z) !== VX.EMPTY
  }

  /** Returns array of {x,y,z,type} for all non-empty voxels */
  getActive() {
    const result = []
    for (let z = 0; z < GRID_D; z++)
      for (let y = 0; y < GRID_H; y++)
        for (let x = 0; x < GRID_W; x++) {
          const t = this._data[this._idx(x, y, z)]
          if (t !== VX.EMPTY) result.push({ x, y, z, type: t })
        }
    return result
  }

  /** Count all voxels of a given type */
  count(type) {
    let n = 0
    for (let i = 0; i < this._data.length; i++)
      if (this._data[i] === type) n++
    return n
  }

  /** Count voxels that bombs can destroy (everything except EMPTY and BEDROCK) */
  countDestructible() {
    let n = 0
    for (let i = 0; i < this._data.length; i++) {
      const t = this._data[i]
      if (t !== VX.EMPTY && t !== VX.BEDROCK) n++
    }
    return n
  }

  clear() {
    this._data.fill(0)
    this.dirty = true
  }

  /**
   * Ray-march DDA through the voxel grid.
   * Returns { x, y, z, type, face } or null.
   * face is one of 'top','bottom','left','right','front','back'
   */
  raycast(origin, dir, maxDist = 80) {
    let x = Math.floor(origin.x)
    let y = Math.floor(origin.y)
    let z = Math.floor(origin.z)

    const dx = dir.x, dy = dir.y, dz = dir.z
    if (dx === 0 && dy === 0 && dz === 0) return null

    const stepX = dx >= 0 ? 1 : -1
    const stepY = dy >= 0 ? 1 : -1
    const stepZ = dz >= 0 ? 1 : -1

    const tDX = Math.abs(1 / (dx || 1e-10))
    const tDY = Math.abs(1 / (dy || 1e-10))
    const tDZ = Math.abs(1 / (dz || 1e-10))

    let tX = dx === 0 ? Infinity : (stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDX
    let tY = dy === 0 ? Infinity : (stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDY
    let tZ = dz === 0 ? Infinity : (stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDZ

    let face = null
    let dist = 0

    for (let i = 0; i < maxDist * 3; i++) {
      const type = this.get(x, y, z)
      if (type !== VX.EMPTY) return { x, y, z, type, face }
      if (dist > maxDist) break

      if (tX < tY && tX < tZ) {
        face = stepX > 0 ? 'left' : 'right'
        dist = tX; tX += tDX; x += stepX
      } else if (tY < tZ) {
        face = stepY > 0 ? 'bottom' : 'top'
        dist = tY; tY += tDY; y += stepY
      } else {
        face = stepZ > 0 ? 'back' : 'front'
        dist = tZ; tZ += tDZ; z += stepZ
      }
    }
    return null
  }
}
