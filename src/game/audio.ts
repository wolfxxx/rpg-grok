import { publicUrl } from '../publicUrl'
import { kenneySfx } from './kenneyAudio'
import { MusicBeds, type MusicBed } from './music'

export type { MusicBed }

/** Kenney clips first, then baked /sfx WAVs, then synth. Unlocks on first user gesture. */

export type Sfx =
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'die'
  | 'crystal'
  | 'dodge'
  | 'foot'
  | 'ui'
  | 'heal'
  | 'boss'
  | 'slam'
  | 'bolt'
  | 'win'
  | 'lose'

const FILES: Record<Sfx, string> = {
  swing: publicUrl('/sfx/swing.wav'),
  hit: publicUrl('/sfx/hit.wav'),
  hurt: publicUrl('/sfx/hurt.wav'),
  die: publicUrl('/sfx/die.wav'),
  crystal: publicUrl('/sfx/crystal.wav'),
  dodge: publicUrl('/sfx/dodge.wav'),
  foot: publicUrl('/sfx/foot.wav'),
  ui: publicUrl('/sfx/ui.wav'),
  heal: publicUrl('/sfx/heal.wav'),
  boss: publicUrl('/sfx/boss.wav'),
  slam: publicUrl('/sfx/die.wav'),
  bolt: publicUrl('/sfx/heal.wav'),
  win: publicUrl('/sfx/win.wav'),
  lose: publicUrl('/sfx/lose.wav'),
}

const GAIN: Record<Sfx, number> = {
  swing: 0.7,
  hit: 0.95,
  hurt: 0.8,
  die: 0.85,
  crystal: 0.7,
  dodge: 0.65,
  foot: 0.32,
  ui: 0.5,
  heal: 0.55,
  boss: 0.9,
  slam: 1.15,
  bolt: 0.7,
  win: 0.7,
  lose: 0.7,
}

export class AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private music: MusicBeds | null = null
  private pendingBed: MusicBed = 'camp'
  private buffers = new Map<Sfx, AudioBuffer[]>()
  private footT = 0
  muted = false

  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.34
      this.master.connect(this.ctx.destination)
      void this.loadSamples()
    }
    const boot = () => this.ensureMusic()
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(boot)
    else boot()
  }

  private ensureMusic(): void {
    if (!this.ctx || !this.master || this.muted) return
    if (this.ctx.state !== 'running') return
    if (!this.music) {
      this.music = new MusicBeds(this.ctx, this.master)
      this.music.start()
    }
    this.music.setBed(this.pendingBed)
  }

  stop(): void {
    void this.ctx?.suspend()
  }

  setBed(bed: MusicBed): void {
    this.pendingBed = bed
    if (!this.music) this.ensureMusic()
    else this.music.setBed(bed)
  }

  setRage(on: boolean): void {
    this.music?.setRage(on)
  }

  tick(dt: number): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return
    this.music?.tick(dt)
  }

  footsteps(dt: number, moving: boolean): void {
    if (!moving) {
      this.footT = 0
      return
    }
    this.footT += dt
    if (this.footT >= 0.34) {
      this.footT = 0
      this.play('foot')
    }
  }

  play(name: Sfx): void {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return
    if (name === 'bolt') {
      this.synth('bolt')
      return
    }
    const list = this.buffers.get(name)
    if (list?.length) {
      const n = name === 'slam' ? Math.min(2, list.length) : 1
      for (let i = 0; i < n; i++) {
        const src = this.ctx.createBufferSource()
        src.buffer = list[i % list.length]
        src.playbackRate.value =
          name === 'slam' ? (i === 0 ? 0.62 : 0.82) : 0.93 + Math.random() * 0.14
        const g = this.ctx.createGain()
        g.gain.value = GAIN[name] * (name === 'slam' && i > 0 ? 0.7 : 1)
        src.connect(g)
        g.connect(this.master)
        src.start()
      }
      if (name === 'slam') this.synth('slam')
      return
    }
    this.synth(name)
  }

  /** Heavy wind-up: low rumble, not a knife draw. */
  charge(): void {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    this.noise(t, 0.28, 0.1, 280, 60)
    this.tone(t, 92, 0.28, 'sine', 0.07, 38)
  }

  private async decodeUrl(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const raw = await res.arrayBuffer()
      return await this.ctx.decodeAudioData(raw.slice(0))
    } catch {
      return null
    }
  }

  private async loadSamples(): Promise<void> {
    if (!this.ctx) return
    await Promise.all(
      (Object.keys(FILES) as Sfx[]).map(async (name) => {
        const loaded: AudioBuffer[] = []
        for (const url of kenneySfx[name] ?? []) {
          const buf = await this.decodeUrl(url)
          if (buf) loaded.push(buf)
        }
        if (!loaded.length) {
          const buf = await this.decodeUrl(FILES[name])
          if (buf) loaded.push(buf)
        }
        if (loaded.length) this.buffers.set(name, loaded)
      }),
    )
  }

  private synth(name: Sfx): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    switch (name) {
      case 'swing':
        this.noise(t, 0.11, 0.12, 1400, 400)
        this.tone(t, 220, 0.09, 'sawtooth', 0.05, 140)
        break
      case 'hit':
        this.noise(t, 0.08, 0.16, 900, 180)
        this.tone(t, 90, 0.12, 'square', 0.1, 40)
        break
      case 'hurt':
        this.tone(t, 280, 0.18, 'sawtooth', 0.09, 70)
        this.noise(t, 0.1, 0.12, 700, 200)
        break
      case 'die':
        this.noise(t, 0.28, 0.18, 500, 80)
        this.tone(t, 110, 0.32, 'triangle', 0.08, 40)
        break
      case 'crystal':
        this.tone(t, 880, 0.16, 'sine', 0.08)
        this.tone(t + 0.06, 1320, 0.2, 'sine', 0.07)
        this.tone(t + 0.12, 1760, 0.22, 'sine', 0.04)
        break
      case 'dodge':
        this.noise(t, 0.14, 0.1, 2200, 600)
        this.tone(t, 420, 0.1, 'sine', 0.04, 180)
        break
      case 'foot':
        this.noise(t, 0.045, 0.045, 280, 90)
        break
      case 'ui':
        this.tone(t, 640, 0.06, 'sine', 0.05)
        this.tone(t + 0.04, 960, 0.07, 'sine', 0.04)
        break
      case 'heal':
        this.tone(t, 523, 0.2, 'sine', 0.05)
        this.tone(t + 0.05, 784, 0.22, 'sine', 0.05)
        break
      case 'boss':
        this.tone(t, 55, 0.55, 'sawtooth', 0.12, 36)
        this.noise(t, 0.4, 0.14, 400, 70)
        break
      case 'slam':
        this.noise(t, 0.24, 0.22, 420, 55)
        this.tone(t, 46, 0.32, 'sine', 0.18, 24)
        this.tone(t, 78, 0.2, 'sawtooth', 0.09, 30)
        this.noise(t + 0.03, 0.14, 0.1, 1600, 180)
        break
      case 'bolt':
        this.noise(t, 0.1, 0.08, 2600, 900)
        this.tone(t, 880, 0.16, 'sine', 0.07, 280)
        this.tone(t, 1320, 0.2, 'sine', 0.05, 420)
        this.tone(t + 0.04, 1760, 0.12, 'sine', 0.03, 600)
        break
      case 'win':
        this.tone(t, 523, 0.18, 'sine', 0.08)
        this.tone(t + 0.12, 659, 0.2, 'sine', 0.08)
        this.tone(t + 0.24, 784, 0.35, 'sine', 0.09)
        break
      case 'lose':
        this.tone(t, 196, 0.35, 'triangle', 0.08, 90)
        this.tone(t + 0.08, 147, 0.45, 'sine', 0.07, 70)
        break
    }
  }

  private tone(when: number, freq: number, dur: number, type: OscillatorType, vol: number, drop = 0): void {
    if (!this.ctx || !this.master) return
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, when)
    if (drop) o.frequency.exponentialRampToValueAtTime(Math.max(20, drop), when + dur)
    g.gain.setValueAtTime(vol, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(when)
    o.stop(when + dur + 0.02)
  }

  private noise(when: number, dur: number, vol: number, startF: number, endF: number): void {
    if (!this.ctx || !this.master) return
    const len = Math.floor(this.ctx.sampleRate * dur)
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(startF, when)
    f.frequency.exponentialRampToValueAtTime(Math.max(40, endF), when + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(when)
  }
}

export const audio = new AudioBus()
