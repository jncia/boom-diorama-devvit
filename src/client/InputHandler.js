// ─────────────────────────────────────────────
//  InputHandler — mouse/touch: orbit, zoom, bomb placement
// ─────────────────────────────────────────────

export class InputHandler {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./Renderer.js').Renderer} renderer
   * @param {import('./VoxelWorld.js').VoxelWorld} world
   * @param {object} callbacks
   *   onPlaceBomb(x, y, z)  — user clicked to place / detonate a bomb
   *   onHover(hit | null)   — mouse move over a voxel face
   */
  constructor(canvas, renderer, world, callbacks) {
    this._canvas   = canvas
    this._renderer = renderer
    this._world    = world
    this._cb       = callbacks

    // Drag state (mouse)
    this._downBtn   = -1      // -1 = no button held
    this._downX = 0; this._downY = 0
    this._lastX = 0; this._lastY = 0
    this._dragMoved = false
    this._dragKind  = null    // 'orbit' | 'pan' | null

    // Touch state
    this._pinchDist  = null
    this._touchLast  = null   // {x, y}         — single-finger last
    this._twoFinger  = null   // {cx, cy, d}    — two-finger centroid + dist

    // Freeze input during detonation animation
    this.frozen = false

    this._bind()
  }

  _bind() {
    const c = this._canvas

    c.addEventListener('mousedown',  e => this._onMouseDown(e))
    c.addEventListener('mouseup',    e => this._onMouseUp(e))
    c.addEventListener('click',      e => this._onClick(e))
    c.addEventListener('mousemove',  e => this._onMouseMove(e))
    c.addEventListener('mouseleave', e => this._onMouseLeave(e))
    c.addEventListener('wheel',      e => this._onWheel(e), { passive: false })
    c.addEventListener('contextmenu',e => e.preventDefault())

    // Touch
    c.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false })
    c.addEventListener('touchmove',  e => this._onTouchMove(e),  { passive: false })
    c.addEventListener('touchend',   e => this._onTouchEnd(e))
    c.addEventListener('touchcancel',e => this._onTouchEnd(e))
  }

  // ── Mouse handlers ──────────────────────────

  _onMouseDown(e) {
    this._downBtn = e.button
    this._downX   = e.clientX
    this._downY   = e.clientY
    this._lastX   = e.clientX
    this._lastY   = e.clientY
    this._dragMoved = false
    this._dragKind  = null
    // Middle mouse → pan, right → pan, shift+left → pan, left default → orbit
    if (e.button === 1 || e.button === 2) this._dragKind = 'pan'
    else if (e.button === 0)              this._dragKind = e.shiftKey ? 'pan' : 'orbit'
  }

  _onMouseUp(e) {
    this._downBtn = -1
    // Leave _dragMoved set so the subsequent click handler can suppress placement
    setTimeout(() => { this._dragMoved = false }, 0)
  }

  _onClick(e) {
    if (this._dragMoved) return
    if (e.button !== 0) return
    if (this.frozen) return
    const hit = this._raycastScreen(e.clientX, e.clientY)
    if (hit) this._cb.onPlaceBomb(hit.x, hit.y, hit.z, hit.face)
  }

  _onMouseMove(e) {
    const dx = e.clientX - this._lastX
    const dy = e.clientY - this._lastY
    this._lastX = e.clientX
    this._lastY = e.clientY

    if (this._downBtn !== -1) {
      const tdx = e.clientX - this._downX
      const tdy = e.clientY - this._downY
      if (!this._dragMoved && (tdx * tdx + tdy * tdy) > 16) {
        this._dragMoved = true
        this._cb.onHover(null)   // hide ghost while orbiting
      }
      if (this._dragMoved) {
        if (this._dragKind === 'pan') this._renderer.pan(dx, dy)
        else                          this._renderer.orbit(-dx * 0.008, -dy * 0.008)
        return
      }
    }

    if (!this.frozen) {
      const hit = this._raycastScreen(e.clientX, e.clientY)
      this._cb.onHover(hit)
    }
  }

  _onMouseLeave() {
    this._cb.onHover(null)
  }

  _onWheel(e) {
    e.preventDefault()
    this._renderer.zoom(e.deltaY * 0.15)
  }

  // ── Touch handlers ───────────────────────────

  _onTouchStart(e) {
    e.preventDefault()
    if (e.touches.length === 2) {
      this._pinchDist = _pinchDistance(e.touches)
      this._twoFinger = _twoFingerCentroid(e.touches)
      this._touchLast = null
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      this._touchLast = { x: t.clientX, y: t.clientY }
      this._downX   = t.clientX
      this._downY   = t.clientY
      this._dragMoved = false
      this._dragKind  = 'orbit'
    }
  }

  _onTouchMove(e) {
    e.preventDefault()
    if (e.touches.length === 2) {
      const d  = _pinchDistance(e.touches)
      const cg = _twoFingerCentroid(e.touches)
      if (this._pinchDist !== null) this._renderer.zoom((this._pinchDist - d) * 0.5)
      if (this._twoFinger !== null) {
        this._renderer.pan(cg.cx - this._twoFinger.cx, cg.cy - this._twoFinger.cy)
      }
      this._pinchDist = d
      this._twoFinger = cg
      this._dragMoved = true
    } else if (e.touches.length === 1 && this._touchLast) {
      const t  = e.touches[0]
      const dx = t.clientX - this._touchLast.x
      const dy = t.clientY - this._touchLast.y
      const tdx = t.clientX - this._downX
      const tdy = t.clientY - this._downY
      if (!this._dragMoved && (tdx * tdx + tdy * tdy) > 25) {
        this._dragMoved = true
        this._cb.onHover(null)
      }
      if (this._dragMoved) this._renderer.orbit(-dx * 0.008, -dy * 0.008)
      else if (!this.frozen) {
        const hit = this._raycastScreen(t.clientX, t.clientY)
        this._cb.onHover(hit)
      }
      this._touchLast = { x: t.clientX, y: t.clientY }
    }
  }

  _onTouchEnd(e) {
    const wasDrag = this._dragMoved
    this._pinchDist = null
    this._twoFinger = null
    this._touchLast = null
    if (!wasDrag && !this.frozen && e.changedTouches.length === 1) {
      const t = e.changedTouches[0]
      const hit = this._raycastScreen(t.clientX, t.clientY)
      if (hit) this._cb.onPlaceBomb(hit.x, hit.y, hit.z, hit.face)
    }
    this._dragMoved = false
  }

  // ── Raycasting ────────────────────────────────

  _raycastScreen(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect()
    const nx = ((clientX - rect.left) / rect.width)  * 2 - 1
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1
    const { origin, dir } = this._renderer.screenToRay(nx, ny)
    return this._world.raycast(origin, dir, 100)
  }
}

function _pinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx*dx + dy*dy)
}

function _twoFingerCentroid(touches) {
  return {
    cx: (touches[0].clientX + touches[1].clientX) / 2,
    cy: (touches[0].clientY + touches[1].clientY) / 2,
  }
}
