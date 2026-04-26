// ─────────────────────────────────────────────
//  Audio — Web Audio API sound effects
//
//  Devvit-port note: Reddit's mobile webview enforces autoplay policy and
//  community-games guidance is "audio must start muted". So `muted` is
//  true by default until the user toggles it on. The toggle is wired in
//  UI.js (sound button + settings entry).
// ─────────────────────────────────────────────

const MUTE_PREF_KEY = 'boomDiorama_muted_v1'

export class Audio {
  constructor() {
    this._ctx   = null
    this._ready = false
    // Default to MUTED on first run — read pref so a returning player
    // who unmuted previously stays unmuted.
    let stored = null
    try { stored = localStorage.getItem(MUTE_PREF_KEY) } catch {}
    this.muted = stored === null ? true : stored === '1'
  }

  _init() {
    if (this._ready) return
    try {
      this._ctx   = new (window.AudioContext || window.webkitAudioContext)()
      this._ready = true
    } catch {}
  }

  resume() {
    this._init()
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {})
    }
  }

  setMuted(muted) {
    this.muted = !!muted
    try { localStorage.setItem(MUTE_PREF_KEY, this.muted ? '1' : '0') } catch {}
    if (!this.muted) {
      this._init()
      this.resume()
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted)
    return this.muted
  }

  // ── Low-level helpers ─────────────────────────

  _osc(type, freq, gain, startT, dur, freqEnd) {
    if (!this._ready || this.muted) return
    const ctx = this._ctx
    const g   = ctx.createGain()
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, startT)
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, startT + dur)
    g.gain.setValueAtTime(gain, startT)
    g.gain.exponentialRampToValueAtTime(0.001, startT + dur)
    osc.connect(g); g.connect(ctx.destination)
    osc.start(startT); osc.stop(startT + dur + 0.01)
  }

  _noise(gain, startT, dur, filterFreq = 2000) {
    if (!this._ready || this.muted) return
    const ctx    = this._ctx
    const bufLen = Math.ceil(ctx.sampleRate * dur)
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data   = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

    const src    = ctx.createBufferSource()
    src.buffer   = buf

    const filt   = ctx.createBiquadFilter()
    filt.type    = 'lowpass'
    filt.frequency.value = filterFreq

    const g      = ctx.createGain()
    g.gain.setValueAtTime(gain, startT)
    g.gain.exponentialRampToValueAtTime(0.001, startT + dur)

    src.connect(filt); filt.connect(g); g.connect(ctx.destination)
    src.start(startT); src.stop(startT + dur + 0.01)
  }

  // ── Sound effects ──────────────────────────────

  tick() {
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    this._osc('sine', 880, 0.04, t, 0.06, 440)
  }

  popSmall() {
    this._init()
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    this._noise(0.4, t, 0.18, 3000)
    this._osc('sawtooth', 200, 0.15, t, 0.12, 80)
  }

  boomMedium() {
    this._init()
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    this._noise(0.7, t, 0.35, 1500)
    this._osc('sawtooth', 120, 0.25, t, 0.25, 40)
    this._osc('sine', 60, 0.3, t, 0.4, 20)
  }

  boomLarge() {
    this._init()
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    this._noise(1.0, t, 0.6, 800)
    this._osc('sawtooth', 80, 0.4, t, 0.5, 20)
    this._osc('sine', 40, 0.5, t, 0.8, 10)
    this._osc('sine', 30, 0.6, t, 0.3, 25)
  }

  boom(bombId) {
    if (bombId === 0)      this.popSmall()
    else if (bombId <= 2)  this.boomMedium()
    else                   this.boomLarge()
  }

  debrisClatter() {
    this._init()
    if (!this._ready || this.muted) return
    const t   = this._ctx.currentTime
    const num = 6
    for (let i = 0; i < num; i++) {
      const dt = Math.random() * 0.3
      this._osc('sine', 200 + Math.random()*400, 0.06, t + dt, 0.05)
    }
  }

  achievementDing() {
    this._init()
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => this._osc('sine', f, 0.15, t + i * 0.1, 0.3))
  }

  levelUp() {
    this._init()
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    const notes = [330, 392, 494, 659]
    notes.forEach((f, i) => this._osc('triangle', f, 0.12, t + i * 0.08, 0.25))
  }

  uiClick() {
    this._init()
    if (!this._ready || this.muted) return
    const t = this._ctx.currentTime
    this._osc('sine', 440, 0.05, t, 0.05, 660)
  }
}
