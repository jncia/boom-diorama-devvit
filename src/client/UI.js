// ─────────────────────────────────────────────
//  UI — DOM HUD, screens (menu / level-select), modals, toasts
// ─────────────────────────────────────────────
import { BOMBS, UPGRADES, ACHIEVEMENTS, xpForLevel } from './constants.js'
import { getLeaderboard } from './api.js'

export class UI {
  constructor(progression, audio) {
    this._prog  = progression
    this._audio = audio   // optional — used to drive the sound toggle

    // HUD refs
    this.$xpBar    = document.getElementById('xp-bar-fill')
    this.$xpLabel  = document.getElementById('xp-label')
    this.$bux      = document.getElementById('bux-display')
    this.$level    = document.getElementById('level-display')
    this.$detonBtn = document.getElementById('detonate-btn')
    this.$flash    = document.getElementById('flash-overlay')
    this.$toast    = document.getElementById('toast-container')
    this.$userBadge = document.getElementById('user-badge')
    this.$soundBtn = document.getElementById('sound-btn')

    this.$bombChip      = document.getElementById('bomb-chip')
    this.$bombChipEmoji = document.getElementById('bomb-chip-emoji')
    this.$bombChipName  = document.getElementById('bomb-chip-name')
    this.$bombChipCost  = document.getElementById('bomb-chip-cost')
    this.$bombPopover   = document.getElementById('bomb-popover')

    this.$menuScreen   = document.getElementById('menu-screen')
    this.$levelsScreen = document.getElementById('levels-screen')
    this.$levelsGrid   = document.getElementById('levels-grid')
    this.$shop         = document.getElementById('shop-modal')
    this.$achieve      = document.getElementById('achievements-modal')
    this.$leaderboard  = document.getElementById('leaderboard-modal')
    this.$complete     = document.getElementById('complete-overlay')
    this.$settings     = document.getElementById('settings-modal')

    this.$puzzleLevel = document.getElementById('puzzle-level')
    this.$puzzlePct   = document.getElementById('puzzle-pct')
    this.$puzzleBar   = document.getElementById('puzzle-bar-fill')
    this.$puzzleTarget= document.getElementById('puzzle-bar-target')
    this.$puzzlePoints= document.getElementById('puzzle-points')

    this.selectedBombId = 0
    this._toastQueue = []
    this._toastActive = false
    this._pointsRemaining = 0
    this._pointsBudget    = 0

    this.onJumpToLevel = null

    this._buildBombPopover()
    this._bindHudButtons()
    this._bindScreenButtons()
    this._bindModalClosures()
    this._bindSoundToggle()
    this.refresh()
  }

  // ═══ User badge ═══════════════════════════════
  setUser({ loggedIn, username }) {
    if (!this.$userBadge) return
    if (loggedIn && username) {
      this.$userBadge.textContent = `u/${username}`
      this.$userBadge.classList.add('show')
    } else {
      this.$userBadge.classList.remove('show')
    }
  }

  // ═══ Sound toggle ════════════════════════════
  _bindSoundToggle() {
    const renderState = () => {
      if (!this._audio) return
      const muted = this._audio.muted
      const icon  = muted ? '🔇' : '🔊'
      if (this.$soundBtn) {
        this.$soundBtn.textContent = icon
        this.$soundBtn.classList.toggle('toggle-on', !muted)
        this.$soundBtn.title = muted ? 'Sound: off (click to enable)' : 'Sound: on'
      }
      const settingsBtn = document.getElementById('settings-sound-btn')
      if (settingsBtn) {
        settingsBtn.textContent = muted ? '🔇 Sound: OFF' : '🔊 Sound: ON'
      }
    }
    const toggle = () => {
      if (!this._audio) return
      const nowMuted = this._audio.toggleMuted()
      renderState()
      if (!nowMuted) this._audio.uiClick()
    }
    this.$soundBtn?.addEventListener('click', toggle)
    document.getElementById('settings-sound-btn')?.addEventListener('click', toggle)
    renderState()
  }

  // ═══ Bomb selector ═══════════════════════════
  _buildBombPopover() {
    this.$bombPopover.innerHTML = ''
    for (const b of BOMBS) {
      const btn = document.createElement('button')
      btn.className = 'bomb-opt'
      btn.dataset.id = b.id
      btn.innerHTML = `
        <span class="emo">${b.emoji}</span>
        <span class="nm">${b.name}</span>
        <span class="cost">${b.cost} pt${b.cost === 1 ? '' : 's'}</span>
      `
      btn.addEventListener('click', () => {
        if (btn.classList.contains('locked')) return
        this.selectBomb(b.id)
        this.closeBombPopover()
      })
      this.$bombPopover.appendChild(btn)
    }
    this.$bombChip.addEventListener('click', e => {
      e.stopPropagation()
      this.$bombPopover.classList.toggle('open')
      this.$bombChip.setAttribute('aria-expanded', this.$bombPopover.classList.contains('open'))
    })
    document.addEventListener('click', e => {
      if (!this.$bombPopover.classList.contains('open')) return
      if (e.target === this.$bombChip || this.$bombChip.contains(e.target)) return
      if (e.target === this.$bombPopover || this.$bombPopover.contains(e.target)) return
      this.closeBombPopover()
    })
    this.selectBomb(0)
  }

  closeBombPopover() {
    this.$bombPopover.classList.remove('open')
    this.$bombChip.setAttribute('aria-expanded', 'false')
  }

  selectBomb(id) {
    const p = this._prog
    if (!p.unlockedBombs[id]) return
    this.selectedBombId = id
    const bomb = BOMBS[id]
    this.$bombChipEmoji.textContent = bomb.emoji
    this.$bombChipName.textContent  = bomb.name
    this._updateBombChipCost()
    this.$bombPopover.querySelectorAll('.bomb-opt').forEach(el => {
      el.classList.toggle('selected', Number(el.dataset.id) === id)
    })
  }

  _updateBombChipCost() {
    const bomb = BOMBS[this.selectedBombId]
    if (!bomb) return
    const costLabel = `${bomb.cost} pt${bomb.cost === 1 ? '' : 's'}`
    this.$bombChipCost.textContent = `${costLabel} · ${this._pointsRemaining} left`
  }

  _bindHudButtons() {
    document.getElementById('menu-btn')?.addEventListener('click', () => this.openMenu())
    document.getElementById('levels-btn')?.addEventListener('click', () => this.openLevelSelect())
  }

  _bindScreenButtons() {
    document.getElementById('menu-close')?.addEventListener('click', () => this.closeAllScreens())
    document.getElementById('levels-close')?.addEventListener('click', () => this.closeAllScreens())

    this.$menuScreen.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action
        if (a === 'resume')            this.closeAllScreens()
        else if (a === 'levels')       this.openLevelSelect()
        else if (a === 'shop')         this.openShop()
        else if (a === 'achievements') this.openAchievements()
        else if (a === 'leaderboard')  this.openLeaderboard()
        else if (a === 'settings')     this.openSettings()
      })
    })
  }

  _bindModalClosures() {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals())
    })
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => { if (e.target === overlay) this.closeAllModals() })
    })
    document.getElementById('reset-btn')?.addEventListener('click', async () => {
      if (!confirm('Reset all progress? This clears your XP, Bux, unlocks, and achievements.')) return
      await this._prog.reset()
      this.refresh()
      this.closeAllModals()
      this.closeAllScreens()
      this.toast('Progress reset!', 'warn')
    })
  }

  refresh() {
    const p = this._prog
    const xpNeeded = xpForLevel(p.level + 1)
    const pct = Math.min(100, (p.xp / xpNeeded) * 100)

    if (this.$xpBar)   this.$xpBar.style.width   = `${pct}%`
    if (this.$xpLabel) this.$xpLabel.textContent  = `${p.xp} / ${xpNeeded} XP`
    if (this.$bux)     this.$bux.textContent       = `⚙ ${p.bux}`
    if (this.$level)   this.$level.textContent     = `Lv ${p.level}`

    this.$bombPopover?.querySelectorAll('.bomb-opt').forEach(el => {
      const id = Number(el.dataset.id)
      const locked = !p.unlockedBombs[id]
      el.disabled = locked
      el.classList.toggle('locked', locked)
    })
    if (!p.unlockedBombs[this.selectedBombId]) this.selectBomb(0)

    this._bindData('puzzleLevel', p.puzzleLevel)
    this._bindData('bux', p.bux)
    this._bindData('achCount', ACHIEVEMENTS.filter(a => p.achievements[a.id]).length)
    this._bindData('clearedCount', Math.max(0, p.puzzleLevel - 1))
  }

  _bindData(key, value) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach(el => { el.textContent = String(value) })
  }

  flash(color = '#ffffff', opacity = 0.3, duration = 90) {
    if (!this.$flash) return
    this.$flash.style.background = color
    this.$flash.style.opacity    = opacity
    setTimeout(() => { this.$flash.style.opacity = 0 }, duration)
  }

  toast(msg, type = 'info') {
    this._toastQueue.push({ msg, type })
    if (!this._toastActive) this._drainToast()
  }
  _drainToast() {
    if (this._toastQueue.length === 0) { this._toastActive = false; return }
    this._toastActive = true
    const { msg, type } = this._toastQueue.shift()
    const el = document.createElement('div')
    el.className = `toast toast-${type}`
    el.textContent = msg
    this.$toast?.appendChild(el)
    requestAnimationFrame(() => el.classList.add('show'))
    setTimeout(() => {
      el.classList.remove('show')
      setTimeout(() => { el.remove(); this._drainToast() }, 400)
    }, 2400)
  }

  levelUp(level) {
    this.toast(`⬆ LEVEL ${level}!`, 'level')
    this.flash('#ffdd44', 0.3, 300)
  }
  achievement(id) {
    const a = ACHIEVEMENTS.find(a => a.id === id)
    if (!a) return
    this.toast(`${a.icon} ${a.name}: ${a.desc}`, 'achieve')
  }

  setPuzzleProgress({ puzzleLevel, destroyed, total, targetPct }) {
    if (this.$puzzleLevel) this.$puzzleLevel.textContent = `Diorama ${puzzleLevel}`
    const pct       = total > 0 ? destroyed / total : 0
    const pctLabel  = Math.floor(pct * 100)
    const tgtLabel  = Math.floor(targetPct * 100)
    if (this.$puzzlePct) {
      this.$puzzlePct.textContent = `${pctLabel}% / ${tgtLabel}%`
      this.$puzzlePct.classList.toggle('done', pct >= targetPct)
    }
    if (this.$puzzleBar)   this.$puzzleBar.style.width = `${Math.min(100, pctLabel)}%`
    if (this.$puzzleTarget) this.$puzzleTarget.style.left = `${tgtLabel}%`
  }

  setPuzzlePoints({ remaining, budget }) {
    this._pointsRemaining = remaining
    this._pointsBudget    = budget
    if (this.$puzzlePoints) {
      this.$puzzlePoints.textContent = `${remaining} / ${budget}`
      this.$puzzlePoints.classList.toggle('low', remaining > 0 && remaining <= Math.max(1, Math.floor(budget * 0.25)))
      this.$puzzlePoints.classList.toggle('out', remaining <= 0)
    }
    this._updateBombChipCost()
    this.$bombPopover?.querySelectorAll('.bomb-opt').forEach(el => {
      const id = Number(el.dataset.id)
      const bomb = BOMBS[id]
      const cant = remaining < (bomb?.cost ?? 0)
      el.classList.toggle('unaffordable', cant && !el.classList.contains('locked'))
    })
  }

  showLevelComplete({ puzzleLevel, destroyedPct, xpBonus, buxBonus, levelBefore, levelAfter, onNext }) {
    const overlay = this.$complete
    if (!overlay) return
    overlay.querySelector('#complete-destroyed').textContent =
      `Diorama ${puzzleLevel} — destroyed ${Math.floor(destroyedPct * 100)}% of the scene`
    overlay.querySelector('#complete-xp').textContent  = `+${xpBonus} XP`
    overlay.querySelector('#complete-bux').textContent = `+${buxBonus} ⚙`
    overlay.querySelector('#complete-level').textContent =
      levelAfter > levelBefore ? `⬆ LEVEL UP → ${levelAfter}` : ''
    overlay.style.display = 'flex'

    const btn = overlay.querySelector('#complete-next-btn')
    const handler = () => {
      btn.removeEventListener('click', handler)
      overlay.style.display = 'none'
      onNext?.()
    }
    btn.addEventListener('click', handler)
  }
  hideLevelComplete() { if (this.$complete) this.$complete.style.display = 'none' }

  openMenu() {
    this.closeAllScreens()
    this.refresh()
    this.$menuScreen.classList.add('show')
  }
  openLevelSelect() {
    this.closeAllScreens()
    this._renderLevelSelect()
    this.$levelsScreen.classList.add('show')
  }
  closeAllScreens() {
    this.$menuScreen.classList.remove('show')
    this.$levelsScreen.classList.remove('show')
  }

  _renderLevelSelect() {
    if (!this.$levelsGrid) return
    const p = this._prog
    const current = p.puzzleLevel
    const count = Math.max(18, current + 6)
    this.$levelsGrid.innerHTML = ''
    for (let lvl = 1; lvl <= count; lvl++) {
      const cleared   = lvl < current
      const isCurrent = lvl === current
      const locked    = lvl > current
      const card = document.createElement('button')
      card.className = 'level-card'
        + (cleared ? ' cleared' : '')
        + (isCurrent ? ' current' : '')
        + (locked ? ' locked' : '')
      const name = _levelPreviewName(lvl)
      const status = cleared ? '✓ Cleared' : isCurrent ? '▶ Current' : '🔒 Locked'
      const statusCls = cleared ? 'done' : ''
      card.innerHTML = `
        <div class="lvl-num">Diorama ${lvl}</div>
        <div class="lvl-name">${name}</div>
        <div class="lvl-meta">
          <span>${Math.floor(_previewTargetPct(lvl) * 100)}% target</span>
          <span class="${statusCls}">${status}</span>
        </div>
      `
      if (!locked) {
        card.addEventListener('click', () => {
          if (!this.onJumpToLevel) return
          this.onJumpToLevel(lvl)
          this.closeAllScreens()
        })
      } else {
        card.disabled = true
      }
      this.$levelsGrid.appendChild(card)
    }
  }

  openShop() {
    this.closeAllModals()
    const modal = this.$shop
    if (!modal) return
    const body = modal.querySelector('.modal-body')
    body.innerHTML = ''
    const p = this._prog

    const bombSection = document.createElement('div')
    bombSection.innerHTML = '<h3>Bombs</h3>'
    for (const b of BOMBS) {
      if (b.unlockCost === 0) continue
      const row = document.createElement('div')
      row.className = 'shop-row'
      const owned = p.unlockedBombs[b.id]
      const locked = p.level < b.unlockLevel
      row.innerHTML = `
        <span class="shop-icon">${b.emoji}</span>
        <span class="shop-name">${b.name}</span>
        <span class="shop-desc">${owned ? '✓ Owned' : locked ? `🔒 Lv ${b.unlockLevel}` : `${b.unlockCost} ⚙`}</span>
        <button class="shop-buy" ${owned || locked || p.bux < b.unlockCost ? 'disabled' : ''}>Buy</button>
      `
      if (!owned && !locked && p.bux >= b.unlockCost) {
        row.querySelector('button').addEventListener('click', () => {
          if (p.buyBomb(b.id)) { this.refresh(); this.openShop() }
        })
      }
      bombSection.appendChild(row)
    }
    body.appendChild(bombSection)

    const upSection = document.createElement('div')
    upSection.innerHTML = '<h3>Upgrades</h3>'
    for (const u of UPGRADES) {
      const row   = document.createElement('div')
      row.className = 'shop-row'
      const lvl   = p.upgradeLevels[u.id] ?? 0
      const maxed = lvl >= u.maxLevel
      const cost  = p.getUpgradeCost(u.id)
      row.innerHTML = `
        <span class="shop-icon">${u.icon ?? '⬆'}</span>
        <span class="shop-name">${u.name}</span>
        <span class="shop-desc">${maxed ? 'MAX' : `${cost} ⚙ (${lvl}/${u.maxLevel})`}</span>
        <button class="shop-buy" ${maxed || p.bux < cost ? 'disabled' : ''}>Buy</button>
      `
      if (!maxed && p.bux >= cost) {
        row.querySelector('button').addEventListener('click', () => {
          if (p.buyUpgrade(u.id)) { this.refresh(); this.openShop() }
        })
      }
      upSection.appendChild(row)
    }
    body.appendChild(upSection)
    modal.style.display = 'flex'
  }

  openAchievements() {
    this.closeAllModals()
    const modal = this.$achieve
    if (!modal) return
    const body = modal.querySelector('.modal-body')
    body.innerHTML = ''
    const p = this._prog
    for (const a of ACHIEVEMENTS) {
      const row = document.createElement('div')
      row.className = `achieve-row ${p.achievements[a.id] ? 'unlocked' : 'locked'}`
      row.innerHTML = `
        <span class="achieve-icon">${a.icon}</span>
        <div class="achieve-text">
          <div class="achieve-name">${a.name}</div>
          <div class="achieve-desc">${a.desc}</div>
        </div>
        <span class="achieve-check">${p.achievements[a.id] ? '✓' : '?'}</span>
      `
      body.appendChild(row)
    }
    modal.style.display = 'flex'
  }

  async openLeaderboard() {
    this.closeAllModals()
    const modal = this.$leaderboard
    if (!modal) return
    modal.style.display = 'flex'
    const list = document.getElementById('leaderboard-list')
    if (!list) return
    list.innerHTML = '<div class="lb-empty">Loading…</div>'

    const { entries = [], you = null } = await getLeaderboard()
    if (entries.length === 0) {
      list.innerHTML = '<div class="lb-empty">No clears recorded yet — be the first!</div>'
      return
    }
    const myName = this._prog.username
    list.innerHTML = ''
    entries.forEach((e, i) => {
      const row = document.createElement('div')
      row.className = 'lb-row'
      const isYou = myName && e.user === myName
      row.innerHTML = `
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-user${isYou ? ' you' : ''}">u/${e.user}${isYou ? ' (you)' : ''}</span>
        <span class="lb-score">Diorama ${e.score}</span>
      `
      list.appendChild(row)
    })
    if (you && !entries.some(e => e.user === myName)) {
      const row = document.createElement('div')
      row.className = 'lb-row'
      row.style.marginTop = '12px'
      row.innerHTML = `
        <span class="lb-rank">#${you.rank ?? '—'}</span>
        <span class="lb-user you">u/${myName} (you)</span>
        <span class="lb-score">Diorama ${you.score}</span>
      `
      list.appendChild(row)
    }
  }

  openSettings() {
    this.closeAllModals()
    if (this.$settings) this.$settings.style.display = 'flex'
  }

  closeAllModals() {
    [this.$shop, this.$achieve, this.$complete, this.$settings, this.$leaderboard].forEach(m => {
      if (m) m.style.display = 'none'
    })
  }

  isModalOpen() {
    if (this.$menuScreen.classList.contains('show'))   return true
    if (this.$levelsScreen.classList.contains('show')) return true
    return [this.$shop, this.$achieve, this.$settings, this.$leaderboard].some(
      m => m && m.style.display !== 'none' && m.style.display !== ''
    )
  }
}

function _previewTargetPct(puzzleLevel) {
  return Math.min(0.85, 0.40 + (puzzleLevel - 1) * 0.05)
}

function _levelPreviewName(puzzleLevel) {
  const ext = Math.max(16, Math.min(40, 16 + (puzzleLevel - 1) * 2))
  const names = []
  if (ext >= 16) names.push('Cottage')
  if (ext >= 22) names.push('Suburb')
  if (ext >= 28) names.push('City Block')
  if (ext >= 34) names.push('Downtown')
  if (names.length === 0) return 'Cottage'
  return names[(puzzleLevel - 1) % names.length]
}
