// ─────────────────────────────────────────────
//  main.js — game loop, orchestration (Devvit Web port)
// ─────────────────────────────────────────────
import { VoxelWorld }      from './VoxelWorld.js'
import { buildDiorama, sceneExtent } from './DioramaBuilder.js'
import { Renderer }        from './Renderer.js'
import { stepParticles, makeParticle, applyShockwaveImpulse } from './Physics.js'
import { prepareShockwave, stepShockwave } from './ExplosionSystem.js'
import { InputHandler }    from './InputHandler.js'
import { Progression }     from './Progression.js'
import { UI }              from './UI.js'
import { Audio }           from './Audio.js'
import { getInit, reportPuzzleClear } from './api.js'
import {
  BOMBS, GROUND_Y, GRID_W, GRID_H, GRID_D, VX, COLORS,
  SLOWMO_DURATION, SLOWMO_FACTOR, SLOWMO_RAMP,
  STRUCTURE_TOPPLE_THRESHOLD, SINKHOLE_HOLLOW_THRESHOLD,
  CHAIN_DETONATION, CHAIN_DETONATION_DELAY,
} from './constants.js'

// ── Init ───────────────────────────────────────
const canvas = document.getElementById('game-canvas')

const world    = new VoxelWorld()
const renderer = new Renderer(canvas)
const prog     = new Progression()
const audio    = new Audio()
const ui       = new UI(prog, audio)

// Debug: expose game state globally for console testing
window._game = { world, renderer, audio, prog, ui }

// ── Game state ─────────────────────────────────
let timeScale    = 1.0
let slowmoTimer  = 0
let slowmoState  = 'none'
const particles  = []

let pendingBombs = []

let initialDestructible = 0
let destroyedSoFar      = 0
let levelCompletePending = false

let pointsBudget    = 0
let pointsRemaining = 0

let structures       = []

let initialColumn    = null
let collapsedColumn  = null

let activeShockwaves = []
let pendingBatch     = null
let bombFireQueue    = []
const MULTI_BOMB_STAGGER = 0.14

function columnIdx(x, z) { return x + z * GRID_W }

function dioramaSeedFor(puzzleLevel) {
  return (puzzleLevel * 2654435761) ^ 0x9e3779b9
}

function buildForCurrentLevel() {
  const result = buildDiorama(world, {
    seed: dioramaSeedFor(prog.puzzleLevel),
    puzzleLevel: prog.puzzleLevel,
  })
  renderer.rebuildWorld(world)
  initialDestructible = world.countDestructible()
  destroyedSoFar      = 0
  levelCompletePending = false

  if (result?.bounds) {
    const b = result.bounds
    renderer.setLookAt(b.cx, GROUND_Y * 0.55, b.cz)
    renderer.zoomToExtent(b.extent)
  }
  if (result?.templateName) ui.toast(`🏗 ${result.templateName}`, 'info')

  structures = (result?.structures ?? []).map(s => ({ ...s, toppled: false }))

  initialColumn   = new Uint16Array(GRID_W * GRID_D)
  collapsedColumn = new Uint8Array(GRID_W * GRID_D)
  for (let z = 0; z < GRID_D; z++) {
    for (let x = 0; x < GRID_W; x++) {
      let n = 0
      for (let y = 3; y < GROUND_Y; y++) {
        const t = world.get(x, y, z)
        if (t !== VX.EMPTY) n++
      }
      initialColumn[columnIdx(x, z)] = n
    }
  }

  pointsBudget    = prog.getPuzzlePointsBudget()
  pointsRemaining = pointsBudget
  refreshPuzzleHUD()
}

function refreshPuzzleHUD() {
  ui.setPuzzleProgress({
    puzzleLevel: prog.puzzleLevel,
    destroyed: destroyedSoFar,
    total: initialDestructible,
    targetPct: prog.getPuzzleTargetPct(),
  })
  const reserved = pendingBombs.reduce((s, b) => s + b.cost, 0)
  ui.setPuzzlePoints({ remaining: Math.max(0, pointsRemaining - reserved), budget: pointsBudget })
}

// Inject runtime CSS for toasts/shop/achievements (replaces the original
// injectStyles() call — kept self-contained so the JS bundle works without
// edits to index.html if the developer rearranges things).
function injectStyles() {
  const css = `
    .toast { background: #1a1a2e; border: 1px solid #444; color: #eee; padding: 8px 16px; border-radius: 6px; margin-top: 6px; font-size: 13px; opacity: 0; transform: translateX(20px); transition: opacity 0.3s, transform 0.3s; max-width: 320px; pointer-events: none; }
    .toast.show { opacity: 1; transform: translateX(0); }
    .toast-level   { border-color: #ffdd44; color: #ffdd44; }
    .toast-achieve { border-color: #44ddaa; color: #44ddaa; }
    .toast-warn    { border-color: #ff8844; color: #ff8844; }
    .shop-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #333; }
    .shop-icon { font-size: 20px; width: 28px; text-align: center; }
    .shop-name { flex: 1; font-size: 13px; }
    .shop-desc { font-size: 11px; color: #999; min-width: 80px; text-align: right; }
    .shop-buy  { background: #2a4a2a; border: 1px solid #4a8a4a; color: #8fc; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 12px; }
    .shop-buy:hover:not(:disabled) { background: #3a6a3a; }
    .shop-buy:disabled { opacity: 0.4; cursor: not-allowed; }
    .modal-body h3 { color: #aaa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 12px 0 4px; }
    .achieve-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #333; }
    .achieve-row.locked { opacity: 0.4; }
    .achieve-icon  { font-size: 22px; width: 28px; text-align: center; }
    .achieve-text  { flex: 1; }
    .achieve-name  { font-size: 13px; font-weight: bold; }
    .achieve-desc  { font-size: 11px; color: #888; }
    .achieve-check { font-size: 18px; color: #4c8; }
  `
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
}
injectStyles()

// ── Bootstrap (async): pull /api/init, hydrate Progression, then start ──
async function bootstrap() {
  let init = null
  try { init = await getInit() } catch {}
  await prog.hydrate(init)
  ui.setUser({ loggedIn: prog.loggedIn, username: prog.username })
  ui.refresh()

  buildForCurrentLevel()
  fadeBootOverlay()
}

function fadeBootOverlay() {
  const el = document.getElementById('boot-overlay')
  if (!el) return
  el.classList.add('fade')
  setTimeout(() => el.remove(), 600)
}

bootstrap().catch(err => {
  console.error('bootstrap failed:', err)
  // Still start the game offline-only so a server outage doesn't brick the UI.
  buildForCurrentLevel()
  fadeBootOverlay()
})

// ── Level-select jump ──────────────────────────
ui.onJumpToLevel = (lvl) => {
  if (lvl > prog.puzzleLevel) return
  if (input.frozen) return
  prog.puzzleLevel = lvl
  prog.save()
  buildForCurrentLevel()
  particles.length = 0
  pendingBombs = []
  renderer.clearBombMarkers()
  updateDetonateBtn()
  ui.refresh()
}

// ── Input ──────────────────────────────────────
const input = new InputHandler(canvas, renderer, world, {
  onHover(hit) {
    if (!hit || ui.isModalOpen()) {
      renderer.hideGhost()
      return
    }
    const bomb = BOMBS[ui.selectedBombId]
    const r    = prog.getBombRadius(ui.selectedBombId)
    if (bomb.shape === 'cylinder') {
      const axis = _faceToAxis(hit.face)
      renderer.showDirectionalGhost(hit.x, hit.y, hit.z, axis, bomb.length, r, bomb.color)
    } else {
      renderer.showGhost(hit.x, hit.y, hit.z, r, bomb.color)
    }
  },

  onPlaceBomb(x, y, z, face) {
    if (ui.isModalOpen()) return
    audio.resume()
    audio.uiClick()

    const bombId = ui.selectedBombId
    const bomb   = BOMBS[bombId]
    const cost   = bomb.cost

    const reservedByPending = pendingBombs.reduce((s, b) => s + b.cost, 0)
    if (pointsRemaining - reservedByPending < cost) {
      ui.toast(`Not enough bomb points — ${bomb.name} costs ${cost}`, 'warn')
      return
    }

    const axis = bomb.shape === 'cylinder' ? _faceToAxis(face) : null
    const b = { x, y, z, face, axis, bombId, cost }

    const maxBombs = prog.getMaxMultiBombs()
    if (maxBombs <= 1) {
      triggerExplosion([b])
    } else {
      pendingBombs.push(b)
      renderer.addBombMarker(x, y, z, bomb.color)
      updateDetonateBtn()
      refreshPuzzleHUD()
      if (pendingBombs.length >= maxBombs) fireAllPending()
    }
  },
})

function _faceToAxis(face) {
  switch (face) {
    case 'left':   return [ 1, 0, 0]
    case 'right':  return [-1, 0, 0]
    case 'bottom': return [ 0, 1, 0]
    case 'top':    return [ 0,-1, 0]
    case 'back':   return [ 0, 0, 1]
    case 'front':  return [ 0, 0,-1]
    default:       return [ 0,-1, 0]
  }
}

function rebuildDiorama() {
  if (input.frozen) return
  buildForCurrentLevel()
  particles.length = 0
  pendingBombs = []
  renderer.clearBombMarkers()
  updateDetonateBtn()
  ui.toast('Diorama rebuilt! 🏘', 'info')
}

function advanceDiorama() {
  buildForCurrentLevel()
  particles.length = 0
  pendingBombs = []
  renderer.clearBombMarkers()
  updateDetonateBtn()
  ui.refresh()
}

document.getElementById('rebuild-btn')?.addEventListener('click', () => {
  rebuildDiorama()
  audio.resume()
  audio.uiClick()
})

document.getElementById('reset-camera-btn')?.addEventListener('click', () => {
  renderer.resetOrbit()
  audio.uiClick()
})

window._game.rebuild = rebuildDiorama

const detonBtn = document.getElementById('detonate-btn')
detonBtn?.addEventListener('click', () => {
  if (pendingBombs.length > 0) fireAllPending()
  else if (prog.getMaxMultiBombs() === 1) {
    ui.toast('Click on the diorama to place a bomb!', 'info')
  }
  audio.resume()
  audio.uiClick()
})

function updateDetonateBtn() {
  if (!detonBtn) return
  const max = prog.getMaxMultiBombs()
  if (max <= 1) {
    detonBtn.textContent = '💥 Detonate'
    detonBtn.disabled    = false
  } else {
    detonBtn.textContent = pendingBombs.length === 0
      ? `💥 Place bombs (0/${max})`
      : `💥 DETONATE (${pendingBombs.length}/${max})`
    detonBtn.disabled = pendingBombs.length === 0
  }
}
updateDetonateBtn()

function fireAllPending() {
  if (pendingBombs.length === 0) return
  const bombs = pendingBombs.slice()
  pendingBombs = []
  renderer.clearBombMarkers()
  updateDetonateBtn()
  triggerExplosion(bombs)
}

function triggerExplosion(bombs) {
  if (input.frozen) return
  input.frozen = true

  const density = prog.getDensityMult()
  for (const b of bombs) pointsRemaining = Math.max(0, pointsRemaining - b.cost)

  pendingBatch = {
    totalTasks: bombs.length,
    doneTasks:  0,
    destroyed:  [],
    xp: 0, bux: 0,
    bombs: bombs.slice(),
    levelBefore: prog.level,
    density,
  }

  for (let i = 0; i < bombs.length; i++) {
    bombFireQueue.push({ bomb: bombs[i], delay: i * MULTI_BOMB_STAGGER })
  }

  ui.flash()
  slowmoState = 'slow'
  slowmoTimer  = SLOWMO_DURATION
  timeScale    = SLOWMO_FACTOR
}

function fireOneBomb(b) {
  const bombDef = BOMBS[b.bombId]
  const radius  = b._chain ? b._chainRadius : prog.getBombRadius(b.bombId)

  applyShockwaveImpulse(b.x + 0.5, b.y + 0.5, b.z + 0.5, radius, particles, prog.getShockwaveForce())

  const opts = (bombDef.shape === 'cylinder' && b.axis)
    ? { shape: 'cylinder', axis: b.axis, length: bombDef.length }
    : { shape: 'sphere' }

  const task = prepareShockwave(b.x + 0.5, b.y + 0.5, b.z + 0.5, radius, world, opts)
  activeShockwaves.push({ task, bomb: b })

  renderer.triggerShockwave(b.x, b.y, b.z, radius)
  renderer.triggerBlastLight(b.x, b.y, b.z, radius)
  renderer.addShake(b._chain ? 0.3 + radius * 0.04 : 0.8 + radius * 0.06)
  if (!b._chain) audio.boom(b.bombId)
  else           audio.boom(0)
}

function tickBombFireQueue(dt) {
  if (bombFireQueue.length === 0) return
  for (let i = 0; i < bombFireQueue.length; i++) {
    bombFireQueue[i].delay -= dt
  }
  while (bombFireQueue.length > 0 && bombFireQueue[0].delay <= 0) {
    const { bomb } = bombFireQueue.shift()
    fireOneBomb(bomb)
  }
}

function stepActiveShockwaves(dt) {
  if (activeShockwaves.length === 0) return
  const density = pendingBatch?.density ?? prog.getDensityMult()
  const chainEnabled = prog.getChainReactionEnabled()

  for (let i = activeShockwaves.length - 1; i >= 0; i--) {
    const { task } = activeShockwaves[i]
    const step = stepShockwave(task, world, particles, dt, density)
    if (step.destroyed.length > 0) {
      if (pendingBatch) {
        for (const cell of step.destroyed) pendingBatch.destroyed.push(cell)
        pendingBatch.xp  += step.xp
        pendingBatch.bux += step.bux
      }
      destroyedSoFar += step.destroyed.length
      refreshPuzzleHUD()

      if (chainEnabled) {
        for (const cell of step.destroyed) {
          const chainRadius = CHAIN_DETONATION[cell.type]
          if (!chainRadius) continue
          const chainBombId = 0
          if (pendingBatch) pendingBatch.totalTasks++
          bombFireQueue.push({
            bomb: { x: cell.x, y: cell.y, z: cell.z, bombId: chainBombId, cost: 0, _chain: true, _chainRadius: chainRadius },
            delay: CHAIN_DETONATION_DELAY,
          })
        }
      }
    }
    if (step.done) {
      activeShockwaves.splice(i, 1)
      if (pendingBatch) {
        pendingBatch.doneTasks++
        if (pendingBatch.doneTasks >= pendingBatch.totalTasks) finalizeBatch()
      }
    }
  }
}

function finalizeBatch() {
  const ctx = pendingBatch
  pendingBatch = null
  if (!ctx) return

  const levelsGained = prog.award(ctx.xp, ctx.bux)
  ui.refresh()
  levelsGained.forEach(lvl => { ui.levelUp(lvl); audio.levelUp() })

  if (ctx.xp > 0 || ctx.bux > 0) {
    ui.toast(`+${ctx.xp} XP  +${ctx.bux} ⚙`, 'info')
  }

  const newAchieve = prog.checkAchievements({
    destroyed: ctx.destroyed,
    bombY: ctx.bombs[0].y,
    groundY: GROUND_Y,
  })
  newAchieve.forEach(id => { ui.achievement(id); audio.achievementDing() })

  const toppledStructures = checkStructureTopples()
  const collapsedColumns  = checkSinkholes(ctx.bombs)
  const extraDestroyed    = toppledStructures + collapsedColumns
  if (extraDestroyed > 0) {
    destroyedSoFar += extraDestroyed
    refreshPuzzleHUD()
  }

  const targetPct = prog.getPuzzleTargetPct()
  const curPct    = initialDestructible > 0 ? destroyedSoFar / initialDestructible : 0
  if (!levelCompletePending && curPct >= targetPct) {
    levelCompletePending = true
    const delayMs = (SLOWMO_RAMP + 0.2) * 1000
    setTimeout(() => {
      const pLevelBefore = prog.level
      const clearedLevel = prog.puzzleLevel
      const { xp, bux, levelsGained: lg } = prog.completePuzzleLevel()
      const pLevelAfter  = prog.level
      lg.forEach(lvl => { ui.levelUp(lvl); audio.levelUp() })
      audio.achievementDing()
      ui.refresh()

      // Server-side leaderboard update — fire-and-forget.
      reportPuzzleClear(clearedLevel).catch(() => {})

      ui.showLevelComplete({
        puzzleLevel: clearedLevel,
        destroyedPct: curPct,
        xpBonus: xp, buxBonus: bux,
        levelBefore: pLevelBefore, levelAfter: pLevelAfter,
        onNext: () => {
          advanceDiorama()
          input.frozen = false
        },
      })
    }, delayMs)
  }

  const unfreezeDelay = (SLOWMO_RAMP + 0.3) * 1000
  setTimeout(() => {
    if (!levelCompletePending) {
      input.frozen = false
      renderer.hideGhost()
    }
    if (!levelCompletePending && pointsRemaining <= 0) {
      const pct = initialDestructible > 0 ? destroyedSoFar / initialDestructible : 0
      if (pct < prog.getPuzzleTargetPct()) {
        ui.toast('Out of bomb points — rebuild (🔄) to retry this diorama.', 'warn')
      }
    }
  }, unfreezeDelay)
}

// ── Structure toppling ─────────────────────────
function checkStructureTopples() {
  let extraDestroyed = 0
  for (const s of structures) {
    if (s.toppled) continue
    if (s.kind !== 'house' && s.kind !== 'smallhouse') continue
    let remaining = 0
    for (const v of s.voxels) if (world.get(v.x, v.y, v.z) !== VX.EMPTY) remaining++
    if (remaining === 0) { s.toppled = true; continue }
    if (remaining / s.initialCount > STRUCTURE_TOPPLE_THRESHOLD) continue

    s.toppled = true
    let cx = 0, cy = 0, cz = 0, n = 0
    for (const v of s.voxels) {
      if (world.get(v.x, v.y, v.z) === VX.EMPTY) continue
      cx += v.x + 0.5; cy += v.y + 0.5; cz += v.z + 0.5; n++
    }
    if (n === 0) continue
    cx /= n; cy /= n; cz /= n

    for (const v of s.voxels) {
      const type = world.get(v.x, v.y, v.z)
      if (type === VX.EMPTY) continue
      const color = COLORS[type] ?? 0x888888
      world.destroy(v.x, v.y, v.z)
      extraDestroyed++

      const dx = (v.x + 0.5) - cx
      const dz = (v.z + 0.5) - cz
      const len = Math.sqrt(dx*dx + dz*dz) || 1
      const nx = dx / len, nz = dz / len
      const heightAboveCentroid = Math.max(0, (v.y + 0.5) - cy)
      const lean = 0.4 + heightAboveCentroid * 0.25 + Math.random() * 0.3

      const p = makeParticle(
        v.x + 0.5, v.y + 0.5, v.z + 0.5,
        nx * lean, 0, nz * lean,
        color, 0.92,
      )
      p.rigid = true
      const spin = 0.5 + Math.random() * 0.8
      p.wrx = -nz * spin + (Math.random() - 0.5) * 0.3
      p.wry =  (Math.random() - 0.5) * 0.4
      p.wrz =  nx * spin + (Math.random() - 0.5) * 0.3
      particles.push(p)
    }
    ui.toast('🏠 House collapsed!', 'achieve')
  }
  return extraDestroyed
}

function checkSinkholes(bombs) {
  if (!initialColumn) return 0
  let extraDestroyed = 0
  const checked = new Set()

  for (const b of bombs) {
    if (b.y >= GROUND_Y - 1) continue
    const radius = Math.ceil(prog.getBombRadius(b.bombId)) + 2
    const x0 = Math.max(0, b.x - radius), x1 = Math.min(GRID_W - 1, b.x + radius)
    const z0 = Math.max(0, b.z - radius), z1 = Math.min(GRID_D - 1, b.z + radius)

    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const idx = columnIdx(x, z)
        if (checked.has(idx) || collapsedColumn[idx]) continue
        checked.add(idx)

        const init = initialColumn[idx]
        if (init < 6) continue

        let remaining = 0
        for (let y = 3; y < GROUND_Y; y++) {
          if (world.get(x, y, z) !== VX.EMPTY) remaining++
        }
        if (remaining / init > SINKHOLE_HOLLOW_THRESHOLD) continue

        collapsedColumn[idx] = 1

        for (let y = 3; y < GRID_H; y++) {
          const type = world.get(x, y, z)
          if (type === VX.EMPTY) continue
          const color = COLORS[type] ?? 0x888888
          world.destroy(x, y, z)
          extraDestroyed++

          const fallKick = 2 + (y - GROUND_Y) * 0.4
          const p = makeParticle(
            x + 0.5, y + 0.5, z + 0.5,
            (Math.random() - 0.5) * 1.4,
            -fallKick - Math.random() * 3,
            (Math.random() - 0.5) * 1.4,
            color, 0.8 + Math.random() * 0.15,
          )
          p.wrx = (Math.random() - 0.5) * 2.5
          p.wrz = (Math.random() - 0.5) * 2.5
          particles.push(p)
        }
      }
    }
  }

  if (extraDestroyed > 0) ui.toast('Sinkhole opened! 🕳', 'achieve')
  return extraDestroyed
}

// ── Game loop ──────────────────────────────────
let lastTime = performance.now()

function loop(now) {
  requestAnimationFrame(loop)

  const rawDt  = Math.min((now - lastTime) / 1000, 0.05)
  lastTime     = now

  if (slowmoState === 'slow') {
    slowmoTimer -= rawDt
    if (slowmoTimer <= 0) {
      slowmoState = 'ramp'
      slowmoTimer = SLOWMO_RAMP
      timeScale   = SLOWMO_FACTOR
    }
  } else if (slowmoState === 'ramp') {
    slowmoTimer -= rawDt
    const t = 1 - Math.max(0, slowmoTimer / SLOWMO_RAMP)
    timeScale = SLOWMO_FACTOR + (1.0 - SLOWMO_FACTOR) * _easeOut(t)
    if (slowmoTimer <= 0) {
      slowmoState = 'none'
      timeScale   = 1.0
    }
  }

  const dt = rawDt * timeScale

  tickBombFireQueue(dt)
  stepActiveShockwaves(dt)
  stepParticles(particles, world, dt)
  renderer.render(dt, particles, world)
}

requestAnimationFrame(loop)

// Flush pending save on tab unload — best effort, doesn't block.
window.addEventListener('pagehide', () => prog.flush())
window.addEventListener('beforeunload', () => prog.flush())

function _easeOut(t) { return 1 - (1 - t) * (1 - t) }
