// ─────────────────────────────────────────────
//  Progression — XP, Bux, levels, shop, saves
//
//  Devvit port: persistence is handled by /api/save and /api/load on the
//  server side (Redis-backed, keyed by Reddit userId). When the player is
//  not logged in (or running outside Devvit), we fall back to localStorage
//  so the game still feels stateful.
//
//  The state itself remains synchronous — save() schedules a debounced
//  fire-and-forget POST so the game loop never waits on the network.
// ─────────────────────────────────────────────
import {
  BOMBS, UPGRADES, ACHIEVEMENTS, xpForLevel, VX,
  puzzleTargetPct, puzzlePointsBudget, PUZZLE_XP_BONUS, PUZZLE_BUX_BONUS,
} from './constants.js'
import { saveProgress, resetProgress, isInDevvit } from './api.js'

const SAVE_KEY = 'boomDiorama_v1'
const SAVE_DEBOUNCE_MS = 800

export class Progression {
  constructor() {
    this.xp      = 0
    this.bux     = 0
    this.level   = 1
    this.xpToNext = xpForLevel(2)

    this.puzzleLevel = 1

    this.unlockedBombs = { 0: true, 1: false, 2: false, 3: false, 4: false }

    this.upgradeLevels = {}
    for (const u of UPGRADES) this.upgradeLevels[u.id] = 0

    this.achievements = {}
    for (const a of ACHIEVEMENTS) this.achievements[a.id] = false

    this.stats = {
      totalXP:     0,
      blasts:      0,
      mailboxes:   0,
      carVoxels:   0,
      houseVoxels: 0,
      undergroundBlasts: 0,
      maxVoxelsSingleBlast: 0,
      treasureHit: false,
    }

    // Debounced save state
    this._saveTimer = null
    this._loaded    = false
    this._loggedIn  = false   // populated by hydrate() once /api/init returns
    this._username  = null
    this._userId    = null

    // No localStorage read in the constructor — main.js calls hydrate()
    // before the first frame renders.
  }

  /**
   * Pull initial state. In Devvit we hit /api/init, which returns the
   * Reddit user identity and any persisted save. Outside Devvit (local
   * dev), we read from localStorage. Returns the auth info so the UI
   * can show the user's badge and decide whether to render leaderboard
   * entry actions.
   */
  async hydrate(initPayload) {
    let saveBlob = null
    if (initPayload && typeof initPayload === 'object') {
      this._loggedIn = !!initPayload.loggedIn
      this._username = initPayload.username ?? null
      this._userId   = initPayload.userId   ?? null
      saveBlob       = initPayload.save     ?? null
    }
    if (!saveBlob) {
      // Fallback to localStorage for anonymous / local-dev users
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) saveBlob = JSON.parse(raw)
      } catch {}
    }
    if (saveBlob) this._applySave(saveBlob)
    this._loaded = true
    return { loggedIn: this._loggedIn, username: this._username }
  }

  get username()  { return this._username }
  get userId()    { return this._userId }
  get loggedIn()  { return this._loggedIn }

  _applySave(d) {
    this.xp           = d.xp   ?? 0
    this.bux          = d.bux  ?? 0
    this.level        = d.level ?? 1
    this.puzzleLevel  = d.puzzleLevel ?? 1
    this.xpToNext     = xpForLevel(this.level + 1)
    this.unlockedBombs = { ...this.unlockedBombs, ...d.unlockedBombs }
    this.upgradeLevels = { ...this.upgradeLevels, ...d.upgradeLevels }
    this.achievements  = { ...this.achievements,  ...d.achievements  }
    this.stats         = { ...this.stats,          ...d.stats        }
  }

  _serialize() {
    return {
      xp: this.xp, bux: this.bux, level: this.level,
      puzzleLevel:   this.puzzleLevel,
      unlockedBombs: this.unlockedBombs,
      upgradeLevels: this.upgradeLevels,
      achievements:  this.achievements,
      stats:         this.stats,
    }
  }

  // ── Bomb radius (with upgrades) ──────────────
  getBombRadius(bombId) {
    const bomb = BOMBS[bombId]
    if (!bomb) return 2.5
    const upKey = `radius_${bombId}`
    const lvl   = this.upgradeLevels[upKey] ?? 0
    return bomb.baseRadius * Math.pow(1.1, lvl)
  }

  getDensityMult() {
    const lvl = this.upgradeLevels['particle_density'] ?? 0
    return 1 + lvl * 0.25
  }

  getMaxMultiBombs() {
    const lvl = this.upgradeLevels['multi_bomb'] ?? 0
    return 1 + lvl
  }

  getPuzzleTargetPct()   { return puzzleTargetPct(this.puzzleLevel) }
  getPuzzlePointsBudget() {
    const base = puzzlePointsBudget(this.puzzleLevel)
    const boost = (this.upgradeLevels['budget_boost'] ?? 0) * 2
    return base + boost
  }

  getShockwaveForce() {
    const lvl = this.upgradeLevels['shockwave_force'] ?? 0
    return 1 + lvl * 0.2
  }

  getChainReactionEnabled() {
    return (this.upgradeLevels['chain_reaction'] ?? 0) > 0
  }

  completePuzzleLevel() {
    const gained = this.award(PUZZLE_XP_BONUS, PUZZLE_BUX_BONUS)
    this.puzzleLevel++
    this.save()
    return { xp: PUZZLE_XP_BONUS, bux: PUZZLE_BUX_BONUS, levelsGained: gained }
  }

  award(xp, bux) {
    this.xp  += xp
    this.bux += bux
    this.stats.totalXP += xp

    const levelsGained = []
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = xpForLevel(this.level + 1)
      levelsGained.push(this.level)

      for (const b of BOMBS) {
        if (!this.unlockedBombs[b.id] && this.level >= b.unlockLevel && b.unlockCost === 0) {
          this.unlockedBombs[b.id] = true
        }
      }
    }
    this.save()
    return levelsGained
  }

  canBuyBomb(bombId) {
    const b = BOMBS[bombId]
    return b && !this.unlockedBombs[bombId]
        && this.level >= b.unlockLevel
        && this.bux  >= b.unlockCost
  }

  buyBomb(bombId) {
    if (!this.canBuyBomb(bombId)) return false
    this.bux -= BOMBS[bombId].unlockCost
    this.unlockedBombs[bombId] = true
    this.save()
    return true
  }

  getUpgradeCost(upgradeId) {
    const u = UPGRADES.find(u => u.id === upgradeId)
    if (!u) return Infinity
    const lvl = this.upgradeLevels[upgradeId] ?? 0
    return Math.floor(u.baseCost * Math.pow(u.costMult, lvl))
  }

  canBuyUpgrade(upgradeId) {
    const u = UPGRADES.find(u => u.id === upgradeId)
    if (!u) return false
    const lvl = this.upgradeLevels[upgradeId] ?? 0
    if (lvl >= u.maxLevel) return false
    return this.bux >= this.getUpgradeCost(upgradeId)
  }

  buyUpgrade(upgradeId) {
    if (!this.canBuyUpgrade(upgradeId)) return false
    const cost = this.getUpgradeCost(upgradeId)
    this.bux -= cost
    this.upgradeLevels[upgradeId] = (this.upgradeLevels[upgradeId] ?? 0) + 1
    this.save()
    return true
  }

  checkAchievements({ destroyed, bombY, groundY }) {
    const newlyUnlocked = []
    const check = (id, condition) => {
      if (!this.achievements[id] && condition) {
        this.achievements[id] = true
        newlyUnlocked.push(id)
      }
    }

    let mailboxCount = 0, carCount = 0, houseCount = 0, treasureCount = 0, totalCount = 0
    for (const v of destroyed) {
      totalCount++
      if (v.type === VX.MAILBOX)     mailboxCount++
      if (v.type === VX.CAR_BODY || v.type === VX.CAR_WINDOW) carCount++
      if (v.type === VX.HOUSE_WALL || v.type === VX.HOUSE_ROOF ||
          v.type === VX.HOUSE_DOOR  || v.type === VX.HOUSE_WINDOW) houseCount++
      if (v.type === VX.TREASURE)    treasureCount++
    }

    this.stats.blasts++
    this.stats.mailboxes   += mailboxCount
    this.stats.carVoxels   += carCount
    this.stats.houseVoxels += houseCount
    if (treasureCount > 0) this.stats.treasureHit = true
    if (bombY < groundY) this.stats.undergroundBlasts++
    this.stats.maxVoxelsSingleBlast = Math.max(this.stats.maxVoxelsSingleBlast, totalCount)

    check('first_blood',    this.stats.blasts >= 1)
    check('mailbox_menace', this.stats.mailboxes >= 10)
    check('car_crusher',    this.stats.carVoxels >= 25)
    check('house_flipper',  this.stats.houseVoxels >= 60)
    check('going_under',    this.stats.undergroundBlasts >= 1)
    check('particle_storm', this.stats.maxVoxelsSingleBlast >= 500)
    check('treasure_hunt',  this.stats.treasureHit)
    check('full_carnage',   this.stats.totalXP >= 1000)

    if (newlyUnlocked.length > 0) this.save()
    return newlyUnlocked
  }

  // ── Persistence ──────────────────────────────
  save() {
    // Always write the localStorage fallback synchronously so refreshes
    // mid-game don't lose progress, even when logged in.
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this._serialize())) } catch {}

    // Debounce server saves so we don't hammer Redis on every voxel kill.
    if (!this._loggedIn) return
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      saveProgress(this._serialize()).catch(() => {})
    }, SAVE_DEBOUNCE_MS)
  }

  /** Force a synchronous flush — call before page unload if needed. */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
      if (this._loggedIn) saveProgress(this._serialize()).catch(() => {})
    }
  }

  async reset() {
    try { localStorage.removeItem(SAVE_KEY) } catch {}
    if (this._loggedIn && isInDevvit) {
      await resetProgress().catch(() => {})
    }
    this.xp = 0; this.bux = 0; this.level = 1
    this.puzzleLevel = 1
    this.xpToNext = xpForLevel(2)
    this.unlockedBombs  = { 0: true, 1: false, 2: false, 3: false, 4: false }
    for (const u of UPGRADES) this.upgradeLevels[u.id] = 0
    for (const a of ACHIEVEMENTS) this.achievements[a.id] = false
    this.stats = { totalXP:0, blasts:0, mailboxes:0, carVoxels:0, houseVoxels:0,
                   undergroundBlasts:0, maxVoxelsSingleBlast:0, treasureHit:false }
  }
}
