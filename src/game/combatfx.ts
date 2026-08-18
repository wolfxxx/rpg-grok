import * as THREE from 'three'
import { heightAtWorld } from './height'

const S = 0.04

function elev(wx: number, wz: number, extra = 0): number {
  return heightAtWorld(wx, wz) + extra
}

function hexCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

export type TelegraphSpec = {
  id: string
  kind: 'line' | 'ring' | 'cone'
  x: number
  y: number
  angle: number
  length: number
  radius: number
  arc: number
  t: number
  color: number
}

export type BoltSpec = {
  id: string
  x: number
  y: number
  angle: number
  color: number
  heavy: boolean
}

type Pop = {
  sprite: THREE.Sprite
  life: number
  x: number
  y: number
}

export class CombatFx {
  private root = new THREE.Group()
  private tels = new Map<string, THREE.Mesh>()
  private bolts = new Map<string, THREE.Group>()
  private pops: Pop[] = []
  private impacts: Array<{ mesh: THREE.Mesh; life: number; max: number; grow: number }> = []
  private dust: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number }> = []
  private slashes: Array<{ mesh: THREE.Mesh; life: number }> = []
  private slashGeo: THREE.PlaneGeometry
  private slashTex: THREE.CanvasTexture
  private coneGeo: THREE.ShapeGeometry
  private ringGeo: THREE.RingGeometry
  private lineGeo: THREE.PlaneGeometry
  private boltGeo: THREE.SphereGeometry
  private boltDartGeo: THREE.ConeGeometry
  private boltGlowGeo: THREE.SphereGeometry
  private discGeo: THREE.CircleGeometry
  private pebbleGeo: THREE.IcosahedronGeometry

  constructor(scene: THREE.Scene, slashTex: THREE.CanvasTexture) {
    scene.add(this.root)
    this.slashTex = slashTex
    this.slashGeo = new THREE.PlaneGeometry(2.6, 1.15)
    this.lineGeo = new THREE.PlaneGeometry(1, 1)
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 40)
    this.boltGeo = new THREE.SphereGeometry(0.16, 8, 8)
    this.boltDartGeo = new THREE.ConeGeometry(0.13, 0.72, 8)
    this.boltGlowGeo = new THREE.SphereGeometry(0.28, 10, 10)
    this.discGeo = new THREE.CircleGeometry(1, 28)
    this.pebbleGeo = new THREE.IcosahedronGeometry(0.1, 0)
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    const segs = 14
    const half = 1
    for (let i = 0; i <= segs; i++) {
      const a = -half + (2 * half * i) / segs
      shape.lineTo(Math.sin(a), Math.cos(a))
    }
    shape.closePath()
    this.coneGeo = new THREE.ShapeGeometry(shape)
  }

  spawnSlash(x: number, y: number, angle: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.slashTex,
      color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(this.slashGeo, mat)
    const fx = Math.cos(angle)
    const fz = Math.sin(angle)
    mesh.position.set(x * S + fx * 1.45, elev(x * S, y * S, 0.95), y * S + fz * 1.45)
    mesh.rotation.set(-0.55, -angle + Math.PI / 2, -0.42)
    this.root.add(mesh)
    this.slashes.push({ mesh, life: 0.2 })
  }

  spawnLunge(x: number, y: number, angle: number, length: number): void {
    const len = Math.max(0.9, length * S)
    const fx = Math.cos(angle)
    const fz = Math.sin(angle)
    const wx = x * S
    const wz = y * S
    const streak = new THREE.Mesh(
      this.lineGeo,
      new THREE.MeshBasicMaterial({
        color: 0x7cbc8a,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    )
    streak.position.set(wx + fx * len * 0.5, elev(wx, wz, 0.08), wz + fz * len * 0.5)
    streak.rotation.set(-Math.PI / 2, 0, -angle)
    streak.scale.set(len, 0.55, 1)
    this.root.add(streak)
    this.impacts.push({ mesh: streak, life: 0.32, max: 0.32, grow: 0.45 })

    for (let i = 0; i < 3; i++) {
      const t = 0.2 + i * 0.28
      this.spawnSlash(x + Math.cos(angle) * length * t, y + Math.sin(angle) * length * t, angle + (i - 1) * 0.18, i === 1 ? 0xc8f4d0 : 0x7cbc8a)
    }
  }

  spawnPop(x: number, y: number, amount: number, color: number): void {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const ctx = c.getContext('2d')!
    ctx.font = '700 40px Manrope, sans-serif'
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#140c0c'
    ctx.lineWidth = 8
    const label = String(Math.round(amount))
    ctx.strokeText(label, 64, 46)
    ctx.fillStyle = hexCss(color)
    ctx.fillText(label, 64, 46)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
    )
    sprite.scale.set(1.15, 0.58, 1)
    sprite.renderOrder = 30
    sprite.position.set(x * S, elev(x * S, y * S, 1.7), y * S)
    this.root.add(sprite)
    this.pops.push({ sprite, life: 0.7, x, y })
  }

  spawnImpact(x: number, y: number, radius: number, color: number, life = 0.32): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(this.ringGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x * S, elev(x * S, y * S, 0.06), y * S)
    const r = Math.max(0.4, radius * S)
    mesh.scale.set(r, r, r)
    this.root.add(mesh)
    this.impacts.push({ mesh, life, max: life, grow: 2.4 })
  }

  spawnSlam(x: number, y: number, radius: number): void {
    const y0 = elev(x * S, y * S, 0.05)
    const flash = new THREE.Mesh(
      this.discGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff2d0,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    )
    flash.rotation.x = -Math.PI / 2
    flash.position.set(x * S, y0, y * S)
    const r = Math.max(0.5, radius * S)
    flash.scale.set(r * 0.35, r * 0.35, 1)
    this.root.add(flash)
    this.impacts.push({ mesh: flash, life: 0.16, max: 0.16, grow: 8 })

    this.spawnImpact(x, y, radius * 0.55, 0xffe0a8, 0.28)
    this.spawnImpact(x, y, radius, 0xe8a87c, 0.55)
    this.spawnImpact(x, y, radius * 1.15, 0xc4845a, 0.4)

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2
      const sp = 3.2 + Math.random() * 4.2
      const pebble = new THREE.Mesh(
        this.pebbleGeo,
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xc4a078 : 0x6a5a48, transparent: true, opacity: 0.95 }),
      )
      pebble.position.set(x * S, y0 + 0.12, y * S)
      pebble.scale.setScalar(0.7 + Math.random() * 1.1)
      this.root.add(pebble)
      this.dust.push({
        mesh: pebble,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: 2.4 + Math.random() * 3.2,
        life: 0.45 + Math.random() * 0.18,
        max: 0.55,
      })
    }
  }

  setTelegraphs(list: TelegraphSpec[]): void {
    const live = new Set<string>()
    for (const spec of list) {
      const tid = `${spec.id}:${spec.kind}`
      live.add(tid)
      let mesh = this.tels.get(tid)
      if (!mesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        const geo = spec.kind === 'ring' ? this.ringGeo : spec.kind === 'cone' ? this.coneGeo : this.lineGeo
        mesh = new THREE.Mesh(geo, mat)
        mesh.renderOrder = 8
        this.root.add(mesh)
        this.tels.set(tid, mesh)
      }
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(spec.color)
      mat.opacity = 0.18 + spec.t * 0.42
      const wx = spec.x * S
      const wz = spec.y * S
      const y = elev(wx, wz, 0.05)
      if (spec.kind === 'line') {
        const len = Math.max(0.4, spec.length * S)
        const fx = Math.cos(spec.angle)
        const fz = Math.sin(spec.angle)
        mesh.position.set(wx + fx * len * 0.5, y, wz + fz * len * 0.5)
        mesh.rotation.set(-Math.PI / 2, 0, -spec.angle)
        mesh.scale.set(len, 0.42, 1)
      } else if (spec.kind === 'ring') {
        const r = Math.max(0.5, spec.radius * S)
        mesh.position.set(wx, y, wz)
        mesh.rotation.set(-Math.PI / 2, 0, 0)
        mesh.scale.set(r, r, r)
      } else {
        const r = Math.max(0.5, spec.radius * S)
        mesh.position.set(wx, y, wz)
        mesh.rotation.set(-Math.PI / 2, 0, -spec.angle + Math.PI / 2)
        mesh.scale.set(r, r, 1)
      }
    }
    for (const [id, mesh] of this.tels) {
      if (live.has(id)) continue
      this.root.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
      this.tels.delete(id)
    }
  }

  spawnCast(x: number, y: number, heavy: boolean): void {
    const col = heavy ? 0xe8ffff : 0x7ee8f2
    this.spawnImpact(x, y, heavy ? 56 : 30, col, heavy ? 0.42 : 0.24)
    const y0 = elev(x * S, y * S, heavy ? 1.15 : 0.95)
    const core = new THREE.Mesh(
      this.discGeo,
      new THREE.MeshBasicMaterial({
        color: heavy ? 0xffffff : 0xb8f4fa,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    )
    core.rotation.x = -Math.PI / 2
    core.position.set(x * S, y0, y * S)
    const s = heavy ? 0.55 : 0.28
    core.scale.set(s, s, 1)
    this.root.add(core)
    this.impacts.push({ mesh: core, life: heavy ? 0.22 : 0.14, max: heavy ? 0.22 : 0.14, grow: 10 })
  }

  setBolts(list: BoltSpec[]): void {
    const live = new Set(list.map((b) => b.id))
    for (const spec of list) {
      let mesh = this.bolts.get(spec.id)
      if (!mesh) {
        mesh = this.makeBolt(spec.color, spec.heavy)
        this.root.add(mesh)
        this.bolts.set(spec.id, mesh)
      }
      const wx = spec.x * S
      const wz = spec.y * S
      const wy = elev(wx, wz, spec.heavy ? 1.15 : 0.95)
      mesh.position.set(wx, wy, wz)
      mesh.lookAt(wx + Math.cos(spec.angle), wy, wz + Math.sin(spec.angle))
      mesh.scale.setScalar(spec.heavy ? 1.85 : 1)
    }
    for (const [id, mesh] of this.bolts) {
      if (live.has(id)) continue
      this.root.remove(mesh)
      mesh.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat.dispose()
      })
      this.bolts.delete(id)
    }
  }

  private makeBolt(color: number, heavy: boolean): THREE.Group {
    const g = new THREE.Group()
    const glow = new THREE.Mesh(
      this.boltGlowGeo,
      new THREE.MeshBasicMaterial({
        color: heavy ? 0xffffff : color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const core = new THREE.Mesh(
      this.boltGeo,
      new THREE.MeshBasicMaterial({
        color: heavy ? 0xffffff : 0xe8ffff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    )
    const dart = new THREE.Mesh(
      this.boltDartGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    dart.rotation.x = -Math.PI / 2
    dart.position.z = -0.22
    g.add(glow)
    g.add(core)
    g.add(dart)
    if (heavy) {
      const ring = new THREE.Mesh(
        this.ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe8ffff,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      )
      ring.scale.setScalar(0.38)
      g.add(ring)
    }
    return g
  }

  update(dt: number): void {
    for (const pop of this.pops) {
      pop.life -= dt
      const u = 1 - pop.life / 0.7
      pop.sprite.position.y = elev(pop.x * S, pop.y * S, 1.7) + u * 0.9
      const mat = pop.sprite.material as THREE.SpriteMaterial
      mat.opacity = Math.max(0, pop.life / 0.55)
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      if (this.pops[i].life > 0) continue
      const pop = this.pops[i]
      this.root.remove(pop.sprite)
      const mat = pop.sprite.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
      this.pops.splice(i, 1)
    }

    for (const imp of this.impacts) {
      imp.life -= dt
      const u = 1 - imp.life / imp.max
      imp.mesh.scale.multiplyScalar(1 + dt * imp.grow)
      ;(imp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 * (1 - u))
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      if (this.impacts[i].life > 0) continue
      const imp = this.impacts[i]
      this.root.remove(imp.mesh)
      ;(imp.mesh.material as THREE.Material).dispose()
      this.impacts.splice(i, 1)
    }

    for (const d of this.dust) {
      d.life -= dt
      d.vy -= 18 * dt
      d.mesh.position.x += d.vx * dt
      d.mesh.position.y += d.vy * dt
      d.mesh.position.z += d.vz * dt
      ;(d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / d.max)
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      if (this.dust[i].life > 0) continue
      const d = this.dust[i]
      this.root.remove(d.mesh)
      ;(d.mesh.material as THREE.Material).dispose()
      this.dust.splice(i, 1)
    }

    for (const sl of this.slashes) {
      sl.life -= dt
      const mat = sl.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, sl.life / 0.2)
      sl.mesh.scale.set(1 + (0.2 - sl.life) * 1.1, 1, 1)
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      if (this.slashes[i].life > 0) continue
      const sl = this.slashes[i]
      this.root.remove(sl.mesh)
      ;(sl.mesh.material as THREE.Material).dispose()
      this.slashes.splice(i, 1)
    }
  }

  dispose(): void {
    this.setTelegraphs([])
    this.setBolts([])
    for (const pop of this.pops) {
      this.root.remove(pop.sprite)
      const mat = pop.sprite.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
    this.pops.length = 0
    for (const imp of this.impacts) {
      this.root.remove(imp.mesh)
      ;(imp.mesh.material as THREE.Material).dispose()
    }
    this.impacts.length = 0
    for (const d of this.dust) {
      this.root.remove(d.mesh)
      ;(d.mesh.material as THREE.Material).dispose()
    }
    this.dust.length = 0
    for (const sl of this.slashes) {
      this.root.remove(sl.mesh)
      ;(sl.mesh.material as THREE.Material).dispose()
    }
    this.slashes.length = 0
    this.slashGeo.dispose()
    this.lineGeo.dispose()
    this.ringGeo.dispose()
    this.coneGeo.dispose()
    this.boltGeo.dispose()
    this.boltDartGeo.dispose()
    this.boltGlowGeo.dispose()
    this.discGeo.dispose()
    this.pebbleGeo.dispose()
    this.slashTex.dispose()
    this.root.parent?.remove(this.root)
  }
}
