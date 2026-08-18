export type MusicBed = 'camp' | 'fight' | 'boss'

type Pattern = {
  bpm: number
  bass: number[]
  lead: number[]
}

/** D minor phrases. Rests are 0. Sixteen 8th-notes. */
const PAT: Record<MusicBed, Pattern> = {
  camp: {
    bpm: 68,
    bass: [146.8, 0, 0, 0, 220, 0, 0, 0, 174.6, 0, 0, 0, 196, 0, 0, 0],
    lead: [293.7, 0, 349.2, 440, 0, 0, 392, 0, 329.6, 0, 349.2, 0, 293.7, 0, 220, 0],
  },
  fight: {
    bpm: 112,
    bass: [146.8, 146.8, 0, 146.8, 174.6, 0, 220, 0, 146.8, 146.8, 0, 174.6, 196, 0, 220, 0],
    lead: [0, 440, 0, 523.3, 587.3, 0, 523.3, 440, 0, 392, 440, 0, 349.2, 0, 392, 0],
  },
  boss: {
    bpm: 88,
    bass: [146.8, 0, 146.8, 146.8, 174.6, 0, 164.8, 0, 146.8, 0, 130.8, 0, 116.5, 116.5, 0, 110],
    lead: [293.7, 0, 0, 349.2, 0, 440, 0, 349.2, 293.7, 0, 261.6, 0, 233.1, 0, 220, 0],
  },
}

/** Sequenced beds. Tiny pad, real phrases. Notes route through the bed gain so fades work. */
export class MusicBeds {
  private ctx: AudioContext
  private out: GainNode
  private beds: Record<MusicBed, GainNode>
  private current: MusicBed | null = null
  private wanted: MusicBed = 'camp'
  private hold = 0
  private rage = false
  private started = false
  private step = 0
  private nextTime = 0

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0.72
    this.out.connect(dest)
    this.beds = {
      camp: ctx.createGain(),
      fight: ctx.createGain(),
      boss: ctx.createGain(),
    }
    for (const g of Object.values(this.beds)) {
      g.gain.value = 0
      g.connect(this.out)
    }
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.air(this.beds.camp, 0.04, 1400)
    this.air(this.beds.fight, 0.05, 1800)
    this.air(this.beds.boss, 0.07, 500)
    this.beds.camp.gain.value = 1
    this.current = 'camp'
    this.wanted = 'camp'
    this.nextTime = this.ctx.currentTime + 0.05
    this.step = 0
  }

  setBed(bed: MusicBed): void {
    this.wanted = bed
    if (!this.current) this.fadeTo(bed, 0.3)
    else if (bed === 'boss' && this.current !== 'boss') {
      this.fadeTo('boss', 0.7)
      this.hold = 0
    }
  }

  setRage(on: boolean): void {
    this.rage = on
  }

  tick(dt: number): void {
    if (!this.started || this.ctx.state !== 'running') return
    if (this.wanted !== this.current) {
      this.hold += dt
      const wait = this.wanted === 'boss' ? 0.12 : this.current === 'boss' ? 2.4 : 1.7
      if (this.hold >= wait) {
        this.fadeTo(this.wanted, this.wanted === 'boss' ? 0.7 : 1.2)
        this.hold = 0
      }
    } else this.hold = 0
    this.schedule()
  }

  mute(on: boolean): void {
    this.out.gain.value = on ? 0 : 0.72
  }

  private fadeTo(bed: MusicBed, dur: number): void {
    const t = this.ctx.currentTime
    for (const key of Object.keys(this.beds) as MusicBed[]) {
      const g = this.beds[key]
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
      g.gain.linearRampToValueAtTime(key === bed ? 1 : 0.0001, t + dur)
    }
    this.current = bed
    this.step = 0
    this.nextTime = t + 0.06
  }

  private schedule(): void {
    const bed = this.current
    if (!bed) return
    const now = this.ctx.currentTime
    if (this.nextTime < now - 0.4) this.nextTime = now
    const pat = PAT[bed]
    const eighth = 60 / pat.bpm / 2
    const stepDur = bed === 'boss' && this.rage ? eighth * 0.8 : eighth
    while (this.nextTime < now + 0.18) {
      this.playStep(bed, this.step, this.nextTime)
      this.nextTime += stepDur
      this.step = (this.step + 1) % 16
    }
  }

  private playStep(bed: MusicBed, step: number, when: number): void {
    const dest = this.beds[bed]
    const pat = PAT[bed]
    const bass = pat.bass[step]
    const lead = pat.lead[step]
    if (bass) {
      const dur = bed === 'fight' ? 0.16 : bed === 'boss' ? 0.28 : 0.42
      this.note(dest, bass, when, dur, bed === 'camp' ? 0.12 : 0.2, 'sine', true)
    }
    if (lead) {
      const dur = bed === 'fight' ? 0.2 : 0.48
      this.note(dest, lead, when, dur, bed === 'camp' ? 0.2 : 0.18, bed === 'boss' ? 'triangle' : 'sine', false)
      if (bed === 'camp') this.note(dest, lead * 1.5, when, dur + 0.12, 0.08, 'sine', false)
    }
    if (bed === 'fight' && step % 2 === 0) this.click(dest, when, 0.055, 1400)
    if (bed === 'boss' && step % 4 === 0) this.click(dest, when, 0.08, 500)
  }

  private note(
    dest: AudioNode,
    freq: number,
    when: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    low: boolean,
  ): void {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, when)
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(vol, when + 0.018)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    if (low) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 980
      o.connect(f)
      f.connect(g)
    } else {
      o.connect(g)
    }
    g.connect(dest)
    o.start(when)
    o.stop(when + dur + 0.03)
  }

  private click(dest: AudioNode, when: number, vol: number, cutoff: number): void {
    const dur = 0.05
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur))
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start(when)
  }

  private air(dest: AudioNode, vol: number, cutoff: number): void {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = this.ctx.createGain()
    g.gain.value = vol
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start()
  }
}
