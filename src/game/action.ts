import { offerBoons, boonById, type BoonDef, type BoonId } from '../data/boons'
import { ENEMIES, HEROES, type EnemyDef, type EnemyId, type HeroDef, type HeroId } from '../data/catalog'
import {
  applyAct,
  blockedAt,
  buildCollision,
  clampWalkable,
  createAmbushes,
  createEnemySpawns,
  createProps,
  LANDMARKS,
  nearestWalkable,
  siteById,
  type ActId,
  type Ambush,
  type WorldProp,
} from '../data/world'
import { View3D } from './view3d'
import { audio, type MusicBed } from './audio'
import type { BoltSpec, TelegraphSpec } from './combatfx'

type EnemyAtk = 'lunge' | 'bolt' | 'slam' | 'sweep' | 'stomp' | 'nova'

type Enemy = {
  key: string
  id: EnemyId
  x: number
  y: number
  hp: number
  maxHp: number
  facing: number
  attackCd: number
  windup: number
  windupMax: number
  aim: number
  atk: EnemyAtk | null
  lungeT: number
  lungeHit: boolean
  stagger: number
  dying: number
  nextHeavy: 0 | 1 | 2
  raged: boolean
  recover: number
  hitFlash: number
  alive: boolean
  moving: boolean
  attacking: boolean
}

type Pulse = {
  x: number
  y: number
  r: number
  dmg: number
  wait: number
  done: boolean
}

type Bolt = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  dmg: number
  life: number
  friendly: boolean
  color: number
  heavy: boolean
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b)
  while (d > Math.PI) d = Math.abs(d - Math.PI * 2)
  return d
}

function scaleFoes(act: ActId): Record<EnemyId, EnemyDef> {
  const hpMul: Record<EnemyId, number> = act === 2 ? { beetle: 1.35, wraith: 1.4, golem: 1.5 } : { beetle: 1, wraith: 1, golem: 1 }
  const atkMul: Record<EnemyId, number> = act === 2 ? { beetle: 1.2, wraith: 1.2, golem: 1.22 } : { beetle: 1, wraith: 1, golem: 1 }
  const out = {} as Record<EnemyId, EnemyDef>
  for (const id of Object.keys(ENEMIES) as EnemyId[]) {
    const d = ENEMIES[id]
    out[id] = {
      ...d,
      hp: Math.round(d.hp * hpMul[id]),
      atk: Math.round(d.atk * atkMul[id]),
      name: act === 2 && id === 'golem' ? 'Veil Colossus' : d.name,
    }
  }
  return out
}

export type HeroSheet = {
  atk: number
  baseAtk: number
  qAtk: number
  baseQAtk: number
  qHits: number
  speed: number
  baseSpeed: number
  dodge: number
  baseDodge: number
  skill: number
  baseSkill: number
  maxHp: number
  baseMaxHp: number
}

export type ActionEvent =
  | { type: 'toast'; text: string }
  | { type: 'dialogue'; lines: string[] }
  | { type: 'victory'; act: ActId }
  | { type: 'gameover' }
  | { type: 'crystal'; count: number }
  | { type: 'boonpick'; options: BoonDef[]; source: 'crystal' | 'well' | 'camp' }
  | {
      type: 'hud'
      hp: number
      maxHp: number
      name: string
      crystals: number
      relic: string
      act: ActId
      skillLabel: string
      skillCd: number
      boons: { id: BoonId; name: string }[]
      sheet: HeroSheet
    }

export type RunCarry = {
  act: ActId
  boons: BoonId[]
  maxHp: number
}

export class ActionGame {
  canvas: HTMLCanvasElement
  hero: HeroDef
  view: View3D
  act: ActId = 1
  collision: Uint8Array
  props: WorldProp[]
  private scaled: Record<EnemyId, EnemyDef>

  x = 420
  y = 820
  vx = 0
  vy = 0
  facing = 0
  hp = 100
  maxHp = 100
  crystals = 0
  boons: BoonId[] = []
  private pendingOffer: BoonId[] = []
  private pendingBoss = false
  invuln = 0
  attackCd = 0
  dodgeCd = 0
  dodging = 0
  attacking = 0
  hitDelay = 0
  hitFlash = 0
  skillCd = 0
  skillWind = 0
  skillDash = 0
  skillDashHit = new Set<string>()
  skillDashFx = 0
  stun = 0
  radius = 22

  camX = 0
  camY = 0
  shake = 0
  hitStop = 0
  winT = 0
  boltN = 0
  healHold = 0
  healHinted = false
  healing = false
  wellGiftTaken = false
  wellGiftHold = 0
  wellGiftHinted = false
  private pendingWell = false
  private pendingCamp = false
  private campGiftArmed = false
  private ambushes: Ambush[] = []
  private ambushFired = new Set<string>()
  private rageSummoned = false
  private spawnN = 0
  pulses: Pulse[] = []

  keys = new Set<string>()
  mouseDown = false
  pointerX = 0
  pointerY = 0
  pointerAngle = 0
  moveTX: number | null = null
  moveTY: number | null = null
  markerLife = 0
  attackTarget: Enemy | null = null
  private movedThisFrame = false

  enemies: Enemy[] = []
  bolts: Bolt[] = []

  running = true
  paused = false
  bossUnlocked = false
  won = false
  dead = false
  onEvent: (e: ActionEvent) => void
  last = 0
  raf = 0
  private unbindInput: (() => void) | null = null

  constructor(
    canvas: HTMLCanvasElement,
    heroId: HeroId,
    onEvent: (e: ActionEvent) => void,
    carry?: RunCarry,
  ) {
    this.act = carry?.act ?? 1
    applyAct(this.act)
    this.scaled = scaleFoes(this.act)
    this.collision = buildCollision()
    this.props = createProps()
    this.canvas = canvas
    this.hero = HEROES.find((h) => h.id === heroId)!
    this.hp = carry?.maxHp ?? this.hero.hp
    this.maxHp = carry?.maxHp ?? this.hero.hp
    if (carry?.boons.length) this.boons = [...carry.boons]
    this.onEvent = onEvent
    this.view = new View3D(canvas, heroId)

    const spawn = this.props.find((p) => p.kind === 'spawn')!
    this.x = spawn.x
    this.y = spawn.y
    this.camX = this.x
    this.camY = this.y

    this.enemies = createEnemySpawns().map((s) => this.makeEnemy(s.id, s.x, s.y, s.key))
    this.ambushes = createAmbushes()
    if (this.act === 2) {
      this.wellGiftTaken = true
      this.campGiftArmed = true
    }

    this.bindInput()
    this.emitHud()
    this.last = performance.now()
    audio.unlock()
    audio.setBed('camp')
    this.paused = true
    this.raf = requestAnimationFrame((t) => this.frame(t))
  }

  openingBrief(): string[] {
    return this.act === 2
      ? [
          'The camp emptied after the Golem fell.',
          'We held a plug. The wound sank anyway. They left marks on the road. E to read them.',
          'South of the gate a ridge looks on the tear. The well still mends if you stand still.',
          'The Colossus is that wound, walking. It wakes if you enter the basin.',
        ]
      : [
          'Elder Voss: The veil tore open. Three Velum Crystals fell across these ruins.',
          'Gather them. Each crystal offers a gift. When the triad is whole, the well offers one last gift.',
          'Then face the Ash Golem in the southeast.',
          'Hold LMB to move · Click to strike · Q skill · RMB / Shift dodge · E talk',
          'Watch the red marks. Step out before they land.',
        ]
  }

  destroy(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.unbindInput?.()
    this.unbindInput = null
    audio.setRage(false)
    audio.setBed('camp')
    this.view.dispose()
  }

  private emitHud(): void {
    this.onEvent({
      type: 'hud',
      hp: this.hp,
      maxHp: this.maxHp,
      name: this.hero.name,
      crystals: this.crystals,
      relic: this.act === 2 ? (this.bossUnlocked ? 'Colossus' : 'The Road') : 'Crystals',
      act: this.act,
      skillLabel: this.hero.skillLabel,
      skillCd: this.skillCd,
      boons: this.boons.map((id) => ({ id, name: boonById(id).name })),
      sheet: this.sheet(),
    })
  }

  private sheet(): HeroSheet {
    const h = this.hero
    const basic = h.id === 'mystic' ? Math.round(h.atk * 0.9) : h.atk
    const qMul = h.id === 'warden' ? (this.hasBoon('quake') ? 2.25 : 1.85) : 1.55
    const baseQMul = h.id === 'warden' ? 1.85 : 1.55
    return {
      atk: this.dmg(basic),
      baseAtk: basic,
      qAtk: this.dmg(Math.round(h.atk * qMul), true),
      baseQAtk: Math.round(h.atk * baseQMul),
      qHits: this.hasBoon('fork') ? 3 : 1,
      speed: Math.round(this.moveSpeed()),
      baseSpeed: h.speed,
      dodge: Math.round(h.dodgeCooldown * (this.hasBoon('swift') ? 0.65 : 1) * 100) / 100,
      baseDodge: h.dodgeCooldown,
      skill: Math.round(h.skillCooldown * (this.hasBoon('surge') ? 0.7 : 1) * 100) / 100,
      baseSkill: h.skillCooldown,
      maxHp: this.maxHp,
      baseMaxHp: h.hp,
    }
  }

  hasBoon(id: BoonId): boolean {
    return this.boons.includes(id)
  }

  private dmg(base: number, skill = false): number {
    let n = base
    if (this.hasBoon('fang')) n *= 1.3
    if (skill && this.hasBoon('surge')) n *= 1.25
    return Math.round(n)
  }

  private moveSpeed(): number {
    return this.hero.speed * (this.hasBoon('stride') ? 1.15 : 1)
  }

  private bindInput(): void {
    const onMouseDown = (e: MouseEvent) => {
      if (this.paused || this.dead || this.won) return
      this.updatePointer(e.clientX, e.clientY)
      if (e.button === 0) {
        this.mouseDown = true
        this.setClickIntent(false)
      } else if (e.button === 2) {
        e.preventDefault()
        this.tryDodge()
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false
    }
    const onMouseMove = (e: MouseEvent) => {
      this.updatePointer(e.clientX, e.clientY)
      if (this.mouseDown && !this.paused && !this.dead && !this.won) this.setClickIntent(true)
    }
    const onContext = (e: Event) => e.preventDefault()

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    this.canvas.addEventListener('mousemove', onMouseMove)
    this.canvas.addEventListener('contextmenu', onContext)

    this.unbindInput = () => {
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('keyup', this.onKeyUp)
      this.canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      this.canvas.removeEventListener('mousemove', onMouseMove)
      this.canvas.removeEventListener('contextmenu', onContext)
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase())
    if (e.key === 'Shift' || e.key.toLowerCase() === 'k') {
      e.preventDefault()
      this.tryDodge()
    }
    if (e.key.toLowerCase() === 'q' || e.key === '1') {
      e.preventDefault()
      this.trySkill()
    }
    if (e.key.toLowerCase() === 'e' || e.key === ' ') {
      e.preventDefault()
      this.interact()
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }

  private updatePointer(clientX: number, clientY: number): void {
    const p = this.view.screenToGround(clientX, clientY)
    if (!p) return
    this.pointerX = p.x
    this.pointerY = p.y
    this.pointerAngle = Math.atan2(this.pointerY - this.y, this.pointerX - this.x)
  }

  private setClickIntent(fromHold: boolean): void {
    // Hold-to-move must not turn into an attack just because the cursor
    // passes near a foe. Only a fresh click on an enemy starts a chase.
    if (fromHold && !this.attackTarget) {
      this.moveTX = this.pointerX
      this.moveTY = this.pointerY
      this.markerLife = 0.35
      return
    }
    const enemy = this.enemyAt(this.pointerX, this.pointerY)
    if (enemy) {
      this.attackTarget = enemy
      this.moveTX = enemy.x
      this.moveTY = enemy.y
      this.markerLife = 0.45
      return
    }
    this.attackTarget = null
    this.moveTX = this.pointerX
    this.moveTY = this.pointerY
    this.markerLife = 0.55
  }

  private enemyAt(x: number, y: number): Enemy | null {
    let best: Enemy | null = null
    let bestD = 18
    for (const e of this.enemies) {
      if (!e.alive) continue
      if (e.id === 'golem' && !this.bossUnlocked) continue
      const d = dist(x, y, e.x, e.y) - this.scaled[e.id].radius
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  private frame = (t: number): void => {
    if (!this.running) return
    const dt = Math.min(0.033, (t - this.last) / 1000)
    this.last = t
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt)
      audio.tick(dt)
      this.draw()
      this.raf = requestAnimationFrame(this.frame)
      return
    }
    if (!this.paused && !this.won && !this.dead) this.update(dt)
    else if (!this.paused && this.winT > 0) this.update(dt)
    this.syncMusic()
    audio.tick(dt)
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  private update(dt: number): void {
    if (this.tryCampGift()) return
    this.attackCd = Math.max(0, this.attackCd - dt)
    this.dodgeCd = Math.max(0, this.dodgeCd - dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.dodging = Math.max(0, this.dodging - dt)
    this.attacking = Math.max(0, this.attacking - dt)
    const wasDash = this.skillDash > 0
    this.skillDash = Math.max(0, this.skillDash - dt)
    if (wasDash && this.skillDash <= 0) this.finishLunge()
    this.stun = Math.max(0, this.stun - dt)
    const prevSkill = this.skillCd
    this.skillCd = Math.max(0, this.skillCd - dt)
    if ((prevSkill > 0 && this.skillCd === 0) || Math.ceil(prevSkill) !== Math.ceil(this.skillCd)) this.emitHud()
    if (this.stun > 0) {
      this.hitDelay = 0
      this.skillWind = 0
      if (this.skillDash <= 0) this.attacking = 0
    }
    if (this.hitDelay > 0) {
      this.hitDelay -= dt
      if (this.hitDelay <= 0) this.resolveAttack()
    }
    if (this.skillWind > 0) {
      this.skillWind -= dt
      if (this.skillWind <= 0) {
        if (this.hero.id === 'warden') this.resolveSlam()
        else if (this.hero.id === 'mystic') this.resolveHeavyBolt()
      }
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt)
    this.shake = Math.max(0, this.shake - dt * 4)
    this.markerLife = Math.max(0, this.markerLife - dt)
    if (this.winT > 0) {
      this.winT -= dt
      if (this.winT <= 0) {
        this.won = true
        audio.play('win')
        this.onEvent({ type: 'victory', act: this.act })
      }
    }

    if (this.attackTarget && this.stun <= 0) {
      if (!this.attackTarget.alive) {
        this.attackTarget = null
        this.moveTX = null
        this.moveTY = null
      } else {
        this.moveTX = this.attackTarget.x
        this.moveTY = this.attackTarget.y
      }
    }

    if (this.skillDash > 0) {
      const boost = 820
      this.vx = Math.cos(this.facing) * boost
      this.vy = Math.sin(this.facing) * boost
      this.skillDashFx -= dt
      if (this.skillDashFx <= 0) {
        this.skillDashFx = 0.055
        this.view.spawnSlash(this.x, this.y, this.facing, 0x7cbc8a)
      }
      for (const e of this.enemies) {
        if (!e.alive || this.skillDashHit.has(e.key)) continue
        if (e.id === 'golem' && !this.bossUnlocked) continue
        if (dist(this.x, this.y, e.x, e.y) < this.radius + this.scaled[e.id].radius + 18) {
          this.skillDashHit.add(e.key)
          this.hurtEnemy(e, this.dmg(Math.round(this.hero.atk * 1.55), true))
          this.view.spawnSlash(e.x, e.y, this.facing, 0xc8f4d0)
          if (this.hasBoon('leech')) {
            this.hp = Math.min(this.maxHp, this.hp + 8)
            this.emitHud()
          }
        }
      }
    } else if (this.dodging > 0) {
      const boost = 420
      this.vx = Math.cos(this.facing) * boost
      this.vy = Math.sin(this.facing) * boost
    } else if (this.stun > 0) {
      this.vx *= 0.55
      this.vy *= 0.55
    } else if (this.moveTX != null && this.moveTY != null) {
      const dx = this.moveTX - this.x
      const dy = this.moveTY - this.y
      const d = Math.hypot(dx, dy)
      if (this.attackTarget) {
        const reach = this.hero.attackRange + this.scaled[this.attackTarget.id].radius * 0.35
        if (d <= reach) {
          this.vx = 0
          this.vy = 0
          this.facing = Math.atan2(this.attackTarget.y - this.y, this.attackTarget.x - this.x)
          this.tryAttack()
        } else {
          this.facing = Math.atan2(dy, dx)
          this.vx = Math.cos(this.facing) * this.moveSpeed()
          this.vy = Math.sin(this.facing) * this.moveSpeed()
        }
      } else if (d < 14) {
        this.moveTX = null
        this.moveTY = null
        this.vx *= 0.5
        this.vy *= 0.5
      } else {
        this.facing = Math.atan2(dy, dx)
        this.vx = Math.cos(this.facing) * this.moveSpeed()
        this.vy = Math.sin(this.facing) * this.moveSpeed()
      }
    } else {
      this.vx *= 0.75
      this.vy *= 0.75
    }

    const ox = this.x
    const oy = this.y
    this.moveEntity(this, this.vx * dt, this.vy * dt, this.radius)
    this.movedThisFrame = Math.hypot(this.x - ox, this.y - oy) > 0.45
    audio.footsteps(dt, this.movedThisFrame && this.dodging <= 0 && this.skillDash <= 0)

    for (const p of this.props) {
      if (p.kind === 'crystal' && !p.taken && dist(this.x, this.y, p.x, p.y) < 36) {
        p.taken = true
        this.crystals += 1
        audio.play('crystal')
        this.onEvent({ type: 'crystal', count: this.crystals })
        if (this.crystals >= 3 && !this.bossUnlocked) {
          this.bossUnlocked = true
          this.pendingBoss = true
        }
        this.emitHud()
        this.offerCrystalGift()
        break
      }
      if (p.kind === 'heal') this.tickHeal(dt)
    }

    this.tickAmbushes()
    this.tickBasin()
    this.updateEnemies(dt)
    this.updateBolts(dt)
    this.updatePulses(dt)
    this.camX = this.x
    this.camY = this.y
  }

  private tickHeal(dt: number): void {
    const well = this.props.find((p) => p.kind === 'heal')
    const inWell = !!well && dist(this.x, this.y, well.x, well.y) < 40
    const still =
      inWell &&
      !this.movedThisFrame &&
      this.dodging <= 0 &&
      this.skillDash <= 0 &&
      this.attacking <= 0 &&
      this.stun <= 0
    if (this.act !== 2 && inWell && this.crystals >= 3 && !this.wellGiftTaken && !this.wellGiftHinted) {
      this.wellGiftHinted = true
      this.onEvent({ type: 'toast', text: 'Stand still. The well has one last gift.' })
    }
    if (!still) {
      this.healHold = 0
      this.wellGiftHold = 0
      this.healing = false
      return
    }
    if (this.act !== 2 && this.crystals >= 3 && !this.wellGiftTaken) {
      this.wellGiftHold += dt
      this.healing = this.wellGiftHold > 0.18
      if (this.wellGiftHold > 0.55) {
        this.wellGiftHold = 0
        this.healing = false
        this.offerWellGift()
        return
      }
    }
    if (this.hp >= this.maxHp) {
      this.healHold = 0
      this.healing = false
      return
    }
    this.healHold += dt
    this.healing = this.healHold > 0.18
    if (!this.healing) return
    if (!this.healHinted) {
      this.healHinted = true
      this.onEvent({ type: 'toast', text: 'Stand still to mend.' })
    }
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + 26 * dt)
    this.emitHud()
    if (Math.floor(before / 10) !== Math.floor(this.hp / 10)) audio.play('heal')
  }

  private updatePulses(dt: number): void {
    for (const p of this.pulses) {
      if (p.done) continue
      p.wait -= dt
      if (p.wait > 0) continue
      p.done = true
      this.view.spawnImpact(p.x, p.y, p.r, 0xc45c4a)
      this.shake = Math.max(this.shake, 0.28)
      if (dist(this.x, this.y, p.x, p.y) < p.r + this.radius) {
        this.hurtPlayer(p.dmg, Math.atan2(this.y - p.y, this.x - p.x), true)
      }
    }
    this.pulses = this.pulses.filter((p) => !p.done)
  }

  private moveEntity(ent: { x: number; y: number }, dx: number, dy: number, radius: number): void {
    const trapped = blockedAt(this.collision, ent.x, ent.y, radius)
    const nx = ent.x + dx
    if (!blockedAt(this.collision, nx, ent.y, radius)) ent.x = nx
    else if (trapped && !blockedAt(this.collision, nx, ent.y, radius * 0.45)) ent.x = nx
    const ny = ent.y + dy
    if (!blockedAt(this.collision, ent.x, ny, radius)) ent.y = ny
    else if (trapped && !blockedAt(this.collision, ent.x, ny, radius * 0.45)) ent.y = ny

    const c = clampWalkable(ent.x, ent.y)
    ent.x = c.x
    ent.y = c.y

    if (blockedAt(this.collision, ent.x, ent.y, radius)) {
      const open = nearestWalkable(this.collision, ent.x, ent.y, radius, dx, dy)
      ent.x = open.x
      ent.y = open.y
    }
  }

  private knock(ent: { x: number; y: number }, angle: number, distAmt: number, radius: number): void {
    const steps = 8
    const s = distAmt / steps
    for (let i = 0; i < steps; i++) {
      this.moveEntity(ent, Math.cos(angle) * s, Math.sin(angle) * s, radius)
    }
  }

  private tryAttack(): void {
    if (this.paused || this.dead || this.won || this.attackCd > 0 || this.dodging > 0 || this.skillDash > 0 || this.stun > 0) return
    this.attackCd = this.hero.attackCooldown
    this.attacking = 0.52
    this.facing = this.pointerAngle || this.facing
    if (this.attackTarget) {
      this.facing = Math.atan2(this.attackTarget.y - this.y, this.attackTarget.x - this.x)
    }
    this.hitDelay = this.hero.id === 'scout' ? 0.11 : this.hero.id === 'mystic' ? 0.16 : 0.18
    audio.play('swing')
  }

  private resolveAttack(): void {
    if (this.hero.id === 'mystic') {
      this.spawnBolt(this.x, this.y, this.facing, 520, this.dmg(Math.round(this.hero.atk * 0.9)), 0.55, true, 0x7ee8f2, 13, false)
      this.view.spawnCast(this.x, this.y, false)
      audio.play('bolt')
      return
    }
    const reach = this.hero.attackRange
    const ax = this.x + Math.cos(this.facing) * (reach * 0.55)
    const ay = this.y + Math.sin(this.facing) * (reach * 0.55)
    const color = this.hero.id === 'scout' ? 0x7cbc8a : 0xe8a87c
    this.view.spawnSlash(this.x, this.y, this.facing, color)

    for (const e of this.enemies) {
      if (!e.alive) continue
      if (e.id === 'golem' && !this.bossUnlocked) continue
      const d = dist(ax, ay, e.x, e.y)
      const ang = Math.atan2(e.y - this.y, e.x - this.x)
      const def = this.scaled[e.id]
      if (d < reach + def.radius && angDiff(ang, this.facing) < 1.15) this.hurtEnemy(e, this.dmg(this.hero.atk))
    }
  }

  private trySkill(): void {
    if (this.paused || this.dead || this.won || this.skillCd > 0 || this.dodging > 0 || this.skillDash > 0 || this.stun > 0) return
    this.skillCd = this.hero.skillCooldown * (this.hasBoon('surge') ? 0.7 : 1)
    this.emitHud()
    if (this.mouseDown || this.moveTX != null) this.facing = this.pointerAngle
    if (this.attackTarget) this.facing = Math.atan2(this.attackTarget.y - this.y, this.attackTarget.x - this.x)

    if (this.hero.id === 'warden') {
      this.attacking = 0.72
      this.skillWind = 0.34
      audio.charge()
      this.vx = 0
      this.vy = 0
      this.moveTX = null
      this.moveTY = null
      return
    }
    if (this.hero.id === 'mystic') {
      this.attacking = 0.55
      this.skillWind = 0.2
      this.vx = 0
      this.vy = 0
      this.moveTX = null
      this.moveTY = null
      return
    }
    this.skillDash = 0.28
    this.skillDashHit = new Set()
    this.skillDashFx = 0
    this.invuln = 0.1
    this.attacking = 0.42
    this.moveTX = null
    this.moveTY = null
    this.view.spawnLunge(this.x, this.y, this.facing, 220)
    audio.play('swing')
  }

  private resolveSlam(): void {
    const r = this.hasBoon('quake') ? 128 : 96
    this.view.spawnSlam(this.x, this.y, r)
    this.shake = 0.95
    this.hitStop = 0.12
    audio.play('slam')
    const mul = this.hasBoon('quake') ? 2.25 : 1.85
    for (const e of this.enemies) {
      if (!e.alive) continue
      if (e.id === 'golem' && !this.bossUnlocked) continue
      if (dist(this.x, this.y, e.x, e.y) < r + this.scaled[e.id].radius * 0.4) {
        this.hurtEnemy(e, this.dmg(Math.round(this.hero.atk * mul), true), true)
      }
    }
  }

  private resolveHeavyBolt(): void {
    const dmg = this.dmg(Math.round(this.hero.atk * 1.55), true)
    const angles = this.hasBoon('fork') ? [this.facing - 0.32, this.facing, this.facing + 0.32] : [this.facing]
    for (const angle of angles) {
      this.spawnBolt(this.x, this.y, angle, 720, dmg, 0.8, true, 0xe8ffff, 22, true)
    }
    this.view.spawnCast(this.x, this.y, true)
    this.shake = Math.max(this.shake, 0.28)
    audio.play('bolt')
  }

  private finishLunge(): void {
    this.view.spawnSlash(this.x, this.y, this.facing, 0xc8f4d0)
    this.view.spawnSlash(this.x, this.y, this.facing + 0.35, 0x7cbc8a)
    this.shake = Math.max(this.shake, 0.22)
  }

  private tryDodge(): void {
    if (this.paused || this.dead || this.won || this.dodgeCd > 0 || this.skillDash > 0) return
    this.dodgeCd = this.hero.dodgeCooldown * (this.hasBoon('swift') ? 0.65 : 1)
    this.dodging = 0.22
    this.invuln = this.hasBoon('swift') ? 0.38 : 0.28
    this.stun = 0
    audio.play('dodge')
    if (this.mouseDown || this.moveTX != null) this.facing = this.pointerAngle
    this.moveTX = null
    this.moveTY = null
    this.attackTarget = null
  }

  private spawnBolt(
    x: number,
    y: number,
    angle: number,
    speed: number,
    dmg: number,
    life: number,
    friendly: boolean,
    color: number,
    r: number,
    heavy = false,
  ): void {
    this.boltN += 1
    this.bolts.push({
      id: `b${this.boltN}`,
      x: x + Math.cos(angle) * 28,
      y: y + Math.sin(angle) * 28,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      dmg,
      life,
      friendly,
      color,
      heavy,
    })
  }

  private updateBolts(dt: number): void {
    for (const b of this.bolts) {
      b.life -= dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (blockedAt(this.collision, b.x, b.y, b.r * 0.4)) {
        b.life = 0
        continue
      }
      if (b.friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue
          if (e.id === 'golem' && !this.bossUnlocked) continue
          if (dist(b.x, b.y, e.x, e.y) < b.r + this.scaled[e.id].radius * 0.7) {
            this.hurtEnemy(e, b.dmg, b.heavy, true)
            this.view.spawnImpact(e.x, e.y, b.heavy ? 52 : 28, b.color)
            b.life = 0
            break
          }
        }
      } else if (dist(b.x, b.y, this.x, this.y) < b.r + this.radius) {
        this.hurtPlayer(b.dmg, Math.atan2(this.y - b.y, this.x - b.x))
        b.life = 0
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0)
  }

  private hurtEnemy(e: Enemy, dmg: number, heavy = false, magic = false): void {
    e.hp -= dmg
    e.hitFlash = 0.15
    this.shake = Math.max(this.shake, heavy ? 0.42 : 0.2)
    this.hitStop = Math.max(this.hitStop, heavy ? 0.1 : 0.045)
    if (!heavy && !magic) audio.play('hit')
    this.view.spawnPop(e.x, e.y, dmg, heavy ? 0xffe0a8 : 0xf2e6d8)
    const a = Math.atan2(e.y - this.y, e.x - this.x)
    this.knock(e, a, e.id === 'golem' ? 6 : heavy ? 36 : 22, this.scaled[e.id].radius * 0.7)
    if (e.id !== 'golem') {
      e.windup = 0
      e.atk = null
      e.lungeT = 0
      e.stagger = 0.18
    } else if (!e.raged && e.hp > 0 && e.hp <= e.maxHp * 0.6) {
      e.raged = true
      e.attackCd = Math.min(e.attackCd, 0.18)
      audio.play('boss')
      this.onEvent({ type: 'toast', text: `${this.scaled.golem.name} rages.` })
      if (this.act === 2 && !this.rageSummoned) {
        this.rageSummoned = true
        this.callVeil('rage')
      }
    }
    if (e.hp <= 0) {
      e.alive = false
      e.dying = 0.9
      e.windup = 0
      e.lungeT = 0
      e.atk = null
      audio.play('die')
      this.onEvent({ type: 'toast', text: `${this.scaled[e.id].name} defeated` })
      if (e.id === 'golem') this.winT = 0.75
    }
  }

  private beginAttack(e: Enemy, kind: EnemyAtk, wind: number): void {
    e.atk = kind
    e.windup = wind
    e.windupMax = wind
    e.aim = Math.atan2(this.y - e.y, this.x - e.x)
    e.facing = e.aim
    e.attacking = true
    e.moving = false
    e.lungeHit = false
  }

  private fireAttack(e: Enemy): void {
    const def = this.scaled[e.id]
    e.attackCd = def.attackCooldown
    const kind = e.atk
    e.atk = null
    if (kind === 'lunge') {
      e.lungeT = 0.22
      e.facing = e.aim
      audio.play('swing')
      return
    }
    if (kind === 'bolt') {
      this.spawnBolt(e.x, e.y, e.aim, 340, def.atk, 0.85, false, 0x5eb1bf, 15)
      audio.play('swing')
      return
    }
    if (kind === 'slam') {
      const r = 118
      this.view.spawnSlam(e.x, e.y, r)
      audio.play('slam')
      this.shake = 0.62
      const d = dist(this.x, this.y, e.x, e.y)
      if (d < r + this.radius) {
        const inner = d < 62
        this.hurtPlayer(inner ? Math.round(def.atk * 1.45) : def.atk, e.aim, true)
      }
    } else if (kind === 'sweep') {
      this.view.spawnSlash(e.x, e.y, e.aim, 0xc45c4a)
      audio.play('swing')
      const d = dist(this.x, this.y, e.x, e.y)
      const ang = Math.atan2(this.y - e.y, this.x - e.x)
      if (d < 108 + this.radius && angDiff(ang, e.aim) < 1.15) this.hurtPlayer(def.atk, e.aim, true)
    } else if (kind === 'stomp') {
      audio.play('boss')
      this.shake = 0.45
      for (let i = 0; i < 5; i++) {
        this.pulses.push({
          x: e.x + Math.cos(e.aim) * (52 + i * 50),
          y: e.y + Math.sin(e.aim) * (52 + i * 50),
          r: 46,
          dmg: def.atk,
          wait: i * 0.07,
          done: false,
        })
      }
    } else if (kind === 'nova') {
      audio.play('boss')
      this.shake = 0.5
      const n = 8
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        this.pulses.push({
          x: e.x + Math.cos(a) * 92,
          y: e.y + Math.sin(a) * 92,
          r: 38,
          dmg: def.atk,
          wait: i % 2 === 0 ? 0 : 0.08,
          done: false,
        })
      }
    }
    if (e.id === 'golem') {
      e.nextHeavy = ((e.nextHeavy + 1) % 3) as 0 | 1 | 2
      e.attackCd = 0
      if (e.raged && kind === 'slam') e.recover = 0.16
      else if (e.raged) e.recover = 0.48
      else e.recover = 0.95
    }
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) {
        e.dying = Math.max(0, e.dying - dt)
        continue
      }
      e.attacking = false
      if (e.id === 'golem' && !this.bossUnlocked) {
        e.windup = 0
        e.moving = false
        continue
      }
      const def = this.scaled[e.id]
      e.attackCd = Math.max(0, e.attackCd - dt)
      e.hitFlash = Math.max(0, e.hitFlash - dt)
      e.moving = false

      if (e.stagger > 0) {
        e.stagger -= dt
        continue
      }

      if (e.lungeT > 0) {
        e.lungeT -= dt
        e.attacking = true
        e.moving = true
        const sp = 780
        this.moveEntity(e, Math.cos(e.aim) * sp * dt, Math.sin(e.aim) * sp * dt, def.radius * 0.7)
        e.facing = e.aim
        if (!e.lungeHit && dist(this.x, this.y, e.x, e.y) < def.radius + this.radius + 8) {
          e.lungeHit = true
          this.hurtPlayer(def.atk, e.aim)
          this.view.spawnSlash(e.x, e.y, e.aim, 0xc45c4a)
        }
        continue
      }

      if (e.windup > 0) {
        e.windup -= dt
        e.attacking = true
        e.facing = e.aim
        if (e.windup <= 0) this.fireAttack(e)
        continue
      }

      if (e.recover > 0) {
        e.recover -= dt
        e.moving = false
        continue
      }

      const d = dist(this.x, this.y, e.x, e.y)
      if (d >= def.aggro) {
        e.x += Math.cos(performance.now() / 800 + e.x) * 8 * dt
        e.y += Math.sin(performance.now() / 900 + e.y) * 8 * dt
        e.moving = true
        continue
      }

      e.facing = Math.atan2(this.y - e.y, this.x - e.x)

      if (e.id === 'wraith') {
        if (d < 88) {
          this.moveEntity(e, -Math.cos(e.facing) * def.speed * dt, -Math.sin(e.facing) * def.speed * dt, def.radius * 0.7)
          e.moving = true
        } else if (d > 200) {
          this.moveEntity(e, Math.cos(e.facing) * def.speed * dt, Math.sin(e.facing) * def.speed * dt, def.radius * 0.7)
          e.moving = true
        } else if (e.attackCd <= 0) {
          this.beginAttack(e, 'bolt', 0.85)
        }
        continue
      }

      if (e.id === 'beetle') {
        if (d > 100) {
          this.moveEntity(e, Math.cos(e.facing) * def.speed * dt, Math.sin(e.facing) * def.speed * dt, def.radius * 0.7)
          e.moving = true
        } else if (e.attackCd <= 0) {
          this.beginAttack(e, 'lunge', 0.78)
        }
        continue
      }

      const homeD = dist(this.x, this.y, LANDMARKS.boss[0], LANDMARKS.boss[1])
      if (e.id === 'golem' && homeD > 155) {
        const hx = LANDMARKS.boss[0] - e.x
        const hy = LANDMARKS.boss[1] - e.y
        const hd = Math.hypot(hx, hy)
        if (hd > 12) {
          const sp = def.speed * (e.raged ? 1.25 : 1)
          this.moveEntity(e, (hx / hd) * sp * dt, (hy / hd) * sp * dt, def.radius * 0.7)
          e.moving = true
          e.facing = Math.atan2(hy, hx)
        }
        continue
      }

      if (d > 105 && !(e.attackCd <= 0 && d > 148)) {
        const sp = def.speed * (e.raged ? 1.25 : 1)
        this.moveEntity(e, Math.cos(e.facing) * sp * dt, Math.sin(e.facing) * sp * dt, def.radius * 0.7)
        e.moving = true
      } else if (e.attackCd <= 0) {
        const rage = e.raged || e.hp <= e.maxHp * 0.6
        const cut = rage ? 0.68 : 1
        if (d > 148) this.beginAttack(e, 'stomp', 1.0 * cut)
        else if (e.nextHeavy === 0) this.beginAttack(e, 'slam', 1.05 * cut)
        else if (e.nextHeavy === 1) this.beginAttack(e, 'sweep', 0.92 * cut)
        else this.beginAttack(e, this.act === 2 ? 'nova' : 'stomp', 1.0 * cut)
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.dying > 0)
  }

  private hurtPlayer(dmg: number, fromAngle: number, launch = false): void {
    if (this.invuln > 0 || this.dodging > 0) return
    this.hp -= dmg
    this.healHold = 0
    this.healing = false
    this.invuln = launch ? 0.38 : 0.55
    this.hitFlash = 0.2
    this.shake = launch ? 0.58 : 0.38
    this.hitStop = Math.max(this.hitStop, launch ? 0.08 : 0.03)
    audio.play('hurt')
    this.view.spawnPop(this.x, this.y, dmg, 0xd4453a)
    this.knock(this, fromAngle, launch ? 92 : 28, this.radius)
    if (launch) {
      this.stun = 0.42
      this.attackTarget = null
      this.moveTX = null
      this.moveTY = null
      this.hitDelay = 0
      this.skillWind = 0
      this.attacking = 0
    }
    this.emitHud()
    if (this.hp <= 0) {
      this.hp = 0
      this.dead = true
      audio.play('lose')
      this.onEvent({ type: 'gameover' })
    }
  }

  private interact(): void {
    let bestD = 70
    let lines: string[] | null = null
    const sage = this.props.find((p) => p.kind === 'sage')
    if (sage) {
      const d = dist(this.x, this.y, sage.x, sage.y)
      if (d < bestD) {
        bestD = d
        const tip =
          this.act === 2
            ? this.bossUnlocked
              ? 'The Colossus is awake. Its attendants hunt. The well still mends if you stand still.'
              : 'I stayed when the tents emptied. Read the cairn. The south ridge looks on the tear. The well-stone tells the rest.'
            : this.crystals >= 3
              ? this.wellGiftTaken
                ? 'The triad is whole. Strike the Ash Golem in the southeast ruins.'
                : 'The triad is whole. Stand still at the well for a last gift, then strike the Ash Golem.'
              : `You hold ${this.crystals} of 3 crystals. Crystal gifts stay if you fall. The well mends only if you stand still.`
        lines = [this.act === 2 ? 'The tear still hums, deeper now.' : 'Elder Voss: The tear still hums.', tip]
      }
    }
    for (const p of this.props) {
      if (p.kind !== 'site' || !p.id) continue
      const d = dist(this.x, this.y, p.x, p.y)
      if (d >= bestD) continue
      const site = siteById(p.id)
      if (!site) continue
      bestD = d
      lines = site.lines
    }
    if (!lines) return
    this.onEvent({ type: 'dialogue', lines })
    audio.play('ui')
  }

  private telegraphs(): TelegraphSpec[] {
    const out: TelegraphSpec[] = []
    for (const e of this.enemies) {
      if (!e.alive || e.windup <= 0 || !e.atk) continue
      const t = e.windup / e.windupMax
      if (e.atk === 'lunge' || e.atk === 'bolt' || e.atk === 'stomp') {
        out.push({
          id: e.key,
          kind: 'line',
          x: e.x,
          y: e.y,
          angle: e.aim,
          length: e.atk === 'stomp' ? 270 : e.atk === 'bolt' ? 210 : 130,
          radius: 0,
          arc: 1,
          t,
          color: e.raged ? 0xe07040 : 0xc45c4a,
        })
      } else if (e.atk === 'slam' || e.atk === 'nova') {
        out.push({
          id: e.key,
          kind: 'ring',
          x: e.x,
          y: e.y,
          angle: e.aim,
          length: 0,
          radius: e.atk === 'nova' ? 92 : 118,
          arc: 1,
          t,
          color: e.raged ? 0xe07040 : 0xc45c4a,
        })
      } else {
        out.push({
          id: e.key,
          kind: 'cone',
          x: e.x,
          y: e.y,
          angle: e.aim,
          length: 0,
          radius: 108,
          arc: 1.15,
          t,
          color: e.raged ? 0xe07040 : 0xc45c4a,
        })
      }
    }
    if (this.skillWind > 0 && this.hero.id === 'warden') {
      out.push({
        id: 'slam-self',
        kind: 'ring',
        x: this.x,
        y: this.y,
        angle: this.facing,
        length: 0,
        radius: 96,
        arc: 1,
        t: this.skillWind / 0.34,
        color: 0xe8a87c,
      })
    }
    if (this.skillWind > 0 && this.hero.id === 'mystic') {
      out.push({
        id: 'bolt-self',
        kind: 'line',
        x: this.x,
        y: this.y,
        angle: this.facing,
        length: 240,
        radius: 0,
        arc: 1,
        t: 1 - this.skillWind / 0.2,
        color: 0x7ee8f2,
      })
    }
    return out
  }

  private boltSpecs(): BoltSpec[] {
    return this.bolts.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      angle: Math.atan2(b.vy, b.vx),
      color: b.color,
      heavy: b.heavy,
    }))
  }

  private draw(): void {
    const moving = this.dodging > 0 || this.skillDash > 0 || this.movedThisFrame
    this.view.sync({
      player: {
        x: this.x,
        y: this.y,
        facing: this.facing,
        moving,
        attacking: this.attacking > 0 || this.skillWind > 0 || this.skillDash > 0,
        slamming: this.skillWind > 0 && this.hero.id === 'warden',
        casting: this.skillWind > 0 && this.hero.id === 'mystic',
        lunging: this.skillDash > 0,
        dodging: this.dodging > 0,
        hitFlash: this.hitFlash > 0,
        hp: this.hp,
        maxHp: this.maxHp,
      },
      enemies: this.enemies.map((e) => ({
        key: e.key,
        id: e.id,
        x: e.x,
        y: e.y,
        facing: e.facing,
        moving: e.moving,
        attacking: e.attacking || e.lungeT > 0,
        recovering: e.recover > 0,
        windup: e.windup > 0,
        alive: e.alive,
        dying: e.dying,
        hp: e.hp,
        maxHp: e.maxHp,
        hitFlash: e.hitFlash > 0,
        dormant: e.id === 'golem' && !this.bossUnlocked,
        raged: e.raged,
      })),
      props: this.props,
      healChannel: this.healing,
      moveMarker:
        this.moveTX != null && this.moveTY != null && this.markerLife > 0 && !this.attackTarget
          ? { x: this.moveTX, y: this.moveTY, life: this.markerLife }
          : null,
      camX: this.camX,
      camY: this.camY,
      shake: this.shake,
      telegraphs: this.telegraphs(),
      bolts: this.boltSpecs(),
    })
    this.view.render()
  }

  snapshot(): RunCarry {
    return { act: 2, boons: [...this.boons], maxHp: this.maxHp }
  }

  setPaused(p: boolean): void {
    this.paused = p
  }

  private syncMusic(): void {
    audio.setBed(this.pickBed())
    const golem = this.enemies.find((e) => e.id === 'golem')
    audio.setRage(!!golem?.raged)
  }

  private pickBed(): MusicBed {
    if (this.won) return 'camp'
    const golem = this.enemies.find((e) => e.id === 'golem')
    if (this.bossUnlocked && golem?.alive) {
      const homeD = dist(this.x, this.y, LANDMARKS.boss[0], LANDMARKS.boss[1])
      const d = dist(this.x, this.y, golem.x, golem.y)
      if (
        golem.raged ||
        golem.hp < golem.maxHp ||
        golem.windup > 0 ||
        golem.attacking ||
        homeD < 165 ||
        d < 140
      ) {
        return 'boss'
      }
    }
    for (const e of this.enemies) {
      if (!e.alive || e.id === 'golem') continue
      if (dist(this.x, this.y, e.x, e.y) < this.scaled[e.id].aggro * 0.82) return 'fight'
    }
    return 'camp'
  }

  private tryCampGift(): boolean {
    if (!this.campGiftArmed) return false
    this.campGiftArmed = false
    const options = offerBoons(this.hero.id, this.boons)
    if (options.length === 0) return false
    this.pendingCamp = true
    this.pendingOffer = options.map((o) => o.id)
    this.setPaused(true)
    this.onEvent({ type: 'boonpick', options, source: 'camp' })
    return true
  }

  private tickAmbushes(): void {
    if (this.act !== 2) return
    for (const a of this.ambushes) {
      if (this.ambushFired.has(a.key)) continue
      if (dist(this.x, this.y, a.x, a.y) > a.r) continue
      this.ambushFired.add(a.key)
      for (const f of a.foes) {
        this.spawnN += 1
        this.dropFoe(f.id, a.x + f.dx, a.y + f.dy, `${a.key}-${this.spawnN}`)
      }
      this.view.spawnImpact(a.x, a.y, 70, 0xa05048)
      this.shake = Math.max(this.shake, 0.35)
      audio.play('boss')
      this.onEvent({ type: 'toast', text: a.toast })
    }
  }

  private tickBasin(): void {
    if (this.act !== 2 || this.bossUnlocked) return
    if (dist(this.x, this.y, LANDMARKS.boss[0], LANDMARKS.boss[1]) > 140) return
    this.bossUnlocked = true
    this.callVeil('wake')
    audio.play('boss')
    this.onEvent({ type: 'toast', text: 'The Colossus wakes. Its attendants hunt.' })
    this.emitHud()
  }

  private callVeil(kind: 'wake' | 'rage'): void {
    const [bx, by] = LANDMARKS.boss
    if (kind === 'wake') {
      this.dropFoe('wraith', bx - 90, by - 24, 'veil-w1')
      this.dropFoe('wraith', bx + 72, by + 36, 'veil-w2')
      return
    }
    this.dropFoe('beetle', bx - 70, by + 58, 'veil-b1')
    this.dropFoe('beetle', bx + 82, by - 48, 'veil-b2')
    this.onEvent({ type: 'toast', text: 'The veil spills beetles.' })
  }

  private makeEnemy(id: Enemy['id'], x: number, y: number, key: string): Enemy {
    const def = this.scaled[id]
    const p = nearestWalkable(this.collision, x, y, def.radius * 0.7)
    return {
      key,
      id,
      x: p.x,
      y: p.y,
      hp: def.hp,
      maxHp: def.hp,
      facing: 0,
      attackCd: 0.35 + Math.random() * 0.6,
      windup: 0,
      windupMax: 1,
      aim: 0,
      atk: null,
      lungeT: 0,
      lungeHit: false,
      stagger: 0,
      dying: 0,
      nextHeavy: 0,
      raged: false,
      recover: 0,
      hitFlash: 0,
      alive: true,
      moving: false,
      attacking: false,
    }
  }

  private dropFoe(id: Enemy['id'], x: number, y: number, key: string): void {
    this.enemies.push(this.makeEnemy(id, x, y, key))
  }

  private offerCrystalGift(): void {
    const options = offerBoons(this.hero.id, this.boons)
    if (options.length === 0) {
      this.finishPendingBoss()
      return
    }
    this.pendingOffer = options.map((o) => o.id)
    this.setPaused(true)
    this.onEvent({ type: 'boonpick', options, source: 'crystal' })
  }

  private offerWellGift(): void {
    this.wellGiftTaken = true
    const options = offerBoons(this.hero.id, this.boons)
    if (options.length === 0) return
    this.pendingWell = true
    this.pendingOffer = options.map((o) => o.id)
    this.setPaused(true)
    audio.play('heal')
    this.onEvent({ type: 'boonpick', options, source: 'well' })
  }

  chooseBoon(id: BoonId): void {
    if (!this.pendingOffer.includes(id) || this.boons.includes(id)) return
    this.boons.push(id)
    this.pendingOffer = []
    if (id === 'ward') {
      this.maxHp += 30
      this.hp = Math.min(this.maxHp, this.hp + 30)
    }
    this.paused = false
    this.emitHud()
    const name = boonById(id).name
    if (this.pendingBoss) {
      this.pendingBoss = false
      audio.play('boss')
      this.onEvent({
        type: 'toast',
        text: `${name}. ${this.scaled.golem.name} awakens. The well may still offer a gift.`,
      })
    } else if (this.pendingWell) {
      this.pendingWell = false
      this.onEvent({ type: 'toast', text: `${name} from the well. Face ${this.scaled.golem.name}.` })
    } else if (this.pendingCamp) {
      this.pendingCamp = false
      this.onEvent({ type: 'toast', text: `${name}. The road is open.` })
    } else {
      this.onEvent({ type: 'toast', text: `${name} taken.` })
    }
  }

  private finishPendingBoss(): void {
    if (!this.pendingBoss) return
    this.pendingBoss = false
    audio.play('boss')
    this.onEvent({ type: 'toast', text: `${this.scaled.golem.name} awakens. Dodge, then strike.` })
  }

  /** Keep crystals, boons, and slain trash. Wake at camp, or the well once the golem is unlocked. */
  retry(): void {
    if (this.won) return
    this.dead = false
    this.paused = false
    this.hp = this.maxHp
    this.vx = 0
    this.vy = 0
    this.invuln = 1.2
    this.attackCd = 0
    this.dodgeCd = 0
    this.dodging = 0
    this.attacking = 0
    this.hitDelay = 0
    this.hitFlash = 0.35
    this.skillCd = 0
    this.skillWind = 0
    this.skillDash = 0
    this.skillDashHit.clear()
    this.skillDashFx = 0
    this.stun = 0
    this.healHold = 0
    this.wellGiftHold = 0
    this.healing = false
    this.attackTarget = null
    this.moveTX = null
    this.moveTY = null
    this.markerLife = 0
    this.mouseDown = false
    this.pulses = []
    this.bolts = []
    this.shake = 0
    this.hitStop = 0
    this.rageSummoned = false

    const atBoss = this.act === 2 ? this.bossUnlocked : this.crystals >= 3 || this.bossUnlocked
    const well = this.props.find((p) => p.kind === 'heal')
    const camp = this.props.find((p) => p.kind === 'spawn')!
    const dest = atBoss && well ? well : camp
    this.x = dest.x
    this.y = dest.y
    this.camX = this.x
    this.camY = this.y
    this.view.snapCamera(this.x, this.y)

    for (const e of this.enemies) {
      if (e.id !== 'golem') continue
      const def = this.scaled.golem
      e.alive = true
      e.dying = 0
      e.hp = def.hp
      e.maxHp = def.hp
      e.raged = false
      e.windup = 0
      e.atk = null
      e.recover = 0
      e.nextHeavy = 0
      e.lungeT = 0
      e.stagger = 0
      e.attacking = false
      e.moving = false
      e.hitFlash = 0
      e.x = LANDMARKS.boss[0]
      e.y = LANDMARKS.boss[1]
    }

    this.emitHud()
    this.onEvent({
      type: 'toast',
      text: atBoss
        ? `The well still holds. ${this.scaled.golem.name} waits.`
        : this.act === 2
          ? 'You wake at camp. The road remains.'
          : 'You wake at camp. Crystals remain.',
    })
  }
}
