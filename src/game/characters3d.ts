import * as THREE from 'three'
import type { AnimName } from './sprites'
import { findJoints, loadActorMesh, type JointKey } from './meshLibrary'

export type ActorKind = 'warden' | 'mystic' | 'scout' | 'beetle' | 'wraith' | 'golem' | 'sage'
export type ActorAnim = AnimName

const PAL: Record<
  ActorKind,
  { primary: number; secondary: number; accent: number; skin: number; dark: number; hair: number; iris: number }
> = {
  warden: { primary: 0x3a4650, secondary: 0x242c32, accent: 0xe8a87c, skin: 0xc9a07a, dark: 0x141a1e, hair: 0x2a2420, iris: 0x4a6a78 },
  mystic: { primary: 0x3e5160, secondary: 0x243038, accent: 0x5eb1bf, skin: 0xddc4a8, dark: 0x141a1e, hair: 0x1c2830, iris: 0x5eb1bf },
  scout: { primary: 0x3a4c40, secondary: 0x24302a, accent: 0x7cbc8a, skin: 0xc4a07c, dark: 0x141a1e, hair: 0x3a2820, iris: 0x5a8a4a },
  beetle: { primary: 0x7a5844, secondary: 0x4a3428, accent: 0xe8a87c, skin: 0x8a6a54, dark: 0x1a1410, hair: 0x2a2018, iris: 0xe8a87c },
  wraith: { primary: 0x2a3e48, secondary: 0x152028, accent: 0x5eb1bf, skin: 0x8ec4ce, dark: 0x0a1014, hair: 0x1a2830, iris: 0xb8f0f8 },
  golem: { primary: 0x6a7278, secondary: 0x3a4248, accent: 0x5eb1bf, skin: 0x7a8288, dark: 0x1a2024, hair: 0x2a3034, iris: 0x5eb1bf },
  sage: { primary: 0x4a5058, secondary: 0x32383e, accent: 0xe8a87c, skin: 0xd4b898, dark: 0x141a1e, hair: 0xe8e2d8, iris: 0x5a6a58 },
}

let toonGradient: THREE.DataTexture | null = null
function gradientMap(): THREE.DataTexture {
  if (toonGradient) return toonGradient
  const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 200, 200, 200, 255, 255, 255, 255, 255])
  toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat)
  toonGradient.needsUpdate = true
  return toonGradient
}

function speckled(hex: number, mix = 0x000000, amount = 0.18): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.fillStyle = `#${hex.toString(16).padStart(6, '0')}`
  ctx.fillRect(0, 0, s, s)
  const r = (mix >> 16) & 255
  const g = (mix >> 8) & 255
  const b = mix & 255
  for (let i = 0; i < s * s * amount; i++) {
    ctx.fillStyle = `rgba(${r},${g},${b},${0.08 + Math.random() * 0.22})`
    ctx.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 1 + (Math.random() * 2) | 0, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function toon(color: number, opts?: { em?: number; emissive?: number; map?: THREE.Texture }) {
  return new THREE.MeshToonMaterial({
    color: opts?.map ? 0xffffff : color,
    map: opts?.map,
    gradientMap: gradientMap(),
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.em ?? 0,
  })
}

function std(color: number, opts?: { metal?: number; rough?: number; em?: number; emissive?: number; opacity?: number }) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts?.metal ?? 0.15,
    roughness: opts?.rough ?? 0.55,
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.em ?? 0,
    transparent: opts?.opacity != null && opts.opacity < 1,
    opacity: opts?.opacity ?? 1,
    depthWrite: opts?.opacity == null || opts.opacity >= 1,
  })
}

function rocky(geo: THREE.BufferGeometry, amount = 0.1): THREE.BufferGeometry {
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    const d = Math.sin(v.x * 8.3 + v.y * 5.1 + v.z * 6.7) * amount + Math.sin(v.x * 19 + v.z * 17) * amount * 0.35
    v.addScaledVector(n, d)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

function lathe(pts: Array<[number, number]>, segs = 18): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segs,
  )
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function clothPlane(width: number, height: number, segX: number, segY: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height, segX, segY)
  geo.translate(0, -height / 2, 0)
  geo.userData.rest = new Float32Array(geo.attributes.position.array)
  geo.userData.height = height
  return geo
}

function clothTube(rt: number, rb: number, height: number, rad = 16, hSeg = 7): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(rt, rb, height, rad, hSeg, true)
  geo.translate(0, -height / 2, 0)
  geo.userData.rest = new Float32Array(geo.attributes.position.array)
  geo.userData.height = height
  return geo
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

type SlashKey = {
  t: number
  arm: [number, number, number]
  fore: number
  weap: [number, number, number]
  torsoY: number
  armL: [number, number, number]
  legL: number
  legR: number
}

function sampleSlash(keys: SlashKey[], t: number): SlashKey {
  if (t <= keys[0].t) return keys[0]
  const last = keys[keys.length - 1]
  if (t >= last.t) return last
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a.t && t <= b.t) {
      const s = (t - a.t) / Math.max(0.0001, b.t - a.t)
      const e = s * s * (3 - 2 * s)
      return {
        t,
        arm: [lerp(a.arm[0], b.arm[0], e), lerp(a.arm[1], b.arm[1], e), lerp(a.arm[2], b.arm[2], e)],
        fore: lerp(a.fore, b.fore, e),
        weap: [lerp(a.weap[0], b.weap[0], e), lerp(a.weap[1], b.weap[1], e), lerp(a.weap[2], b.weap[2], e)],
        torsoY: lerp(a.torsoY, b.torsoY, e),
        armL: [lerp(a.armL[0], b.armL[0], e), lerp(a.armL[1], b.armL[1], e), lerp(a.armL[2], b.armL[2], e)],
        legL: lerp(a.legL, b.legL, e),
        legR: lerp(a.legR, b.legR, e),
      }
    }
  }
  return last
}

/**
 * Stylized in-engine characters: jointed bodies, sculpted faces, toon outlines.
 * No portrait billboards — volume reads from every angle.
 */
export class Actor3D {
  root = new THREE.Group()
  kind: ActorKind
  anim: ActorAnim = 'idle'
  animT = 0
  flash = 0

  private phase = Math.random() * 10
  private body = new THREE.Group()
  private hip = new THREE.Group()
  private torso = new THREE.Group()
  private head = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private shinL = new THREE.Group()
  private shinR = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private forearmL = new THREE.Group()
  private forearmR = new THREE.Group()
  private cape = new THREE.Group()
  private orbit = new THREE.Group()
  private ponytail = new THREE.Group()
  private pony2 = new THREE.Group()
  private weapon = new THREE.Group()
  private tip = new THREE.Object3D()
  private beetleLegs: THREE.Group[] = []
  private cloth: Array<{ mesh: THREE.Mesh; amp: number; mode: 'cape' | 'robe' }> = []
  private sway = new THREE.Vector2(0, 0.08)
  private swayV = new THREE.Vector2()
  private trailHist: THREE.Vector3[] = []
  private trailMesh: THREE.Mesh | null = null
  private trailGeo: THREE.BufferGeometry | null = null
  private _v = new THREE.Vector3()
  private _v2 = new THREE.Vector3()
  private _v3 = new THREE.Vector3()
  private mats: Array<THREE.MeshToonMaterial | THREE.MeshStandardMaterial> = []
  private outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a1014, side: THREE.BackSide })
  private bulk = 1
  private tall = 1
  private attackLen = 0.48
  private dead = false

  constructor(kind: ActorKind) {
    this.kind = kind
    this.root.add(this.body)
    if (kind === 'beetle') this.buildBeetle()
    else if (kind === 'wraith') this.buildWraith()
    else if (kind === 'golem') this.buildGolem()
    else this.buildHumanoid()
    this.buildTrail()

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(kind === 'golem' ? 0.95 : 0.45, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.02
    this.root.add(shadow)

    void this.adoptGltf()
  }

  private async adoptGltf(): Promise<void> {
    const pending = loadActorMesh(this.kind)
    if (!pending) return
    try {
      const scene = await pending
      if (this.dead) return
      this.attachGltf(scene)
    } catch {
      // Keep the procedural mesh if the file is missing or corrupt.
    }
  }

  private attachGltf(scene: THREE.Object3D): void {
    const joints = findJoints(scene)
    if (!joints.hip && !joints.torso) return

    const old = [...this.body.children]
    for (const child of old) this.body.remove(child)
    this.cloth.length = 0
    this.mats.length = 0

    const bind: Array<[JointKey, THREE.Group]> = [
      ['hip', this.hip],
      ['torso', this.torso],
      ['head', this.head],
      ['legL', this.legL],
      ['legR', this.legR],
      ['shinL', this.shinL],
      ['shinR', this.shinR],
      ['armL', this.armL],
      ['armR', this.armR],
      ['forearmL', this.forearmL],
      ['forearmR', this.forearmR],
      ['weapon', this.weapon],
    ]
    for (const [key] of bind) {
      const node = joints[key]
      if (!node) continue
      if (key === 'hip') this.hip = node as THREE.Group
      else if (key === 'torso') this.torso = node as THREE.Group
      else if (key === 'head') this.head = node as THREE.Group
      else if (key === 'legL') this.legL = node as THREE.Group
      else if (key === 'legR') this.legR = node as THREE.Group
      else if (key === 'shinL') this.shinL = node as THREE.Group
      else if (key === 'shinR') this.shinR = node as THREE.Group
      else if (key === 'armL') this.armL = node as THREE.Group
      else if (key === 'armR') this.armR = node as THREE.Group
      else if (key === 'forearmL') this.forearmL = node as THREE.Group
      else if (key === 'forearmR') this.forearmR = node as THREE.Group
      else if (key === 'weapon') this.weapon = node as THREE.Group
    }

    if (this.weapon.parent) {
      const tipY = this.kind === 'golem' ? 0.45 : this.kind === 'mystic' ? 0.95 : this.kind === 'scout' ? 0.55 : 0.9
      this.tip.position.set(0, tipY, 0)
      this.weapon.add(this.tip)
    }

    this.restyleImported(scene)
    scene.position.set(0, 0, 0)
    for (const child of scene.children) {
      if (child.name === 'Kael' || child.name === 'Golem' || child.name === 'Seris' || child.name === 'Nyra') {
        child.position.set(0, 0, 0)
      }
    }
    this.body.add(scene)
  }

  private restyleImported(root: THREE.Object3D): void {
    const meshes: THREE.Mesh[] = []
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) meshes.push(mesh)
    })
    const box = new THREE.Box3()
    const size = new THREE.Vector3()
    for (const mesh of meshes) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material
      const list = Array.isArray(src) ? src : [src]
      for (const mat of list) {
        const std = mat as THREE.MeshStandardMaterial
        if (!std?.color) continue
        std.side = THREE.FrontSide
        this.track(std)
      }
      // Per-piece 7% hulls turn a 100-part GLB into a black toy. Skip trim
      // and keep a thin silhouette only on large volumes.
      box.setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute)
      box.getSize(size)
      if (size.length() < 0.18) continue
      const outline = new THREE.Mesh(mesh.geometry, this.outlineMat)
      outline.scale.setScalar(1.018)
      outline.castShadow = false
      outline.receiveShadow = false
      mesh.add(outline)
    }
  }

  private track<T extends THREE.MeshToonMaterial | THREE.MeshStandardMaterial>(m: T): T {
    this.mats.push(m)
    return m
  }

  private add(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number] = [0, 0, 0],
    scale?: [number, number, number],
    outline = true,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    m.position.set(...pos)
    if (scale) m.scale.set(...scale)
    if (outline) {
      const o = new THREE.Mesh(geo, this.outlineMat)
      o.scale.setScalar(1.075)
      m.add(o)
    }
    parent.add(m)
    return m
  }

  private addCloth(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    amp: number,
    mode: 'cape' | 'robe',
  ): THREE.Mesh {
    if ('side' in mat) (mat as THREE.MeshToonMaterial | THREE.MeshStandardMaterial).side = THREE.DoubleSide
    const m = this.add(parent, geo, mat, pos, undefined, false)
    this.cloth.push({ mesh: m, amp, mode })
    return m
  }

  private buildBlade(length: number, width: number, steel: THREE.Material, copper: THREE.Material): void {
    this.add(this.weapon, new THREE.CylinderGeometry(0.022, 0.026, 0.16, 8), this.track(toon(0x3a2e26)), [0, 0.02, 0], undefined, false)
    this.add(this.weapon, new THREE.BoxGeometry(width * 2.4, 0.035, 0.055), copper, [0, -0.08, 0])
    const blade = new THREE.CylinderGeometry(0.006, width * 0.55, length, 4)
    blade.rotateY(Math.PI / 4)
    this.add(this.weapon, blade, steel, [0, -0.1 - length / 2, 0])
    this.add(this.weapon, new THREE.ConeGeometry(width * 0.22, 0.12, 4), steel, [0, -0.16 - length, 0], undefined, false)
    this.tip.position.set(0, -0.22 - length, 0)
    this.weapon.add(this.tip)
  }

  private buildTrail(): void {
    const max = 16
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(max * 2 * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const idx: number[] = []
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setIndex(idx)
    geo.setDrawRange(0, 0)
    const accent = PAL[this.kind].accent
    const mat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.trailGeo = geo
    this.trailMesh = new THREE.Mesh(geo, mat)
    this.trailMesh.frustumCulled = false
    this.trailMesh.visible = false
    this.root.add(this.trailMesh)
  }

  private sculptFace(iris: number, skin: THREE.Material, opts?: { brow?: number }): void {
    const dark = this.track(toon(0x1a1410))
    const white = this.track(toon(0xf2eee8))
    const irisM = this.track(toon(iris, { emissive: iris, em: 0.12 }))
    const pupil = this.track(toon(0x0a0c0e))
    const browC = this.track(toon(opts?.brow ?? PAL[this.kind].hair))

    for (const x of [-0.075, 0.075]) {
      this.add(this.head, new THREE.SphereGeometry(0.038, 10, 8), white, [x, 0.02, 0.175], [1.15, 0.9, 0.7], false)
      this.add(this.head, new THREE.SphereGeometry(0.024, 10, 8), irisM, [x, 0.02, 0.2], undefined, false)
      this.add(this.head, new THREE.SphereGeometry(0.012, 8, 6), pupil, [x, 0.02, 0.218], undefined, false)
      const brow = this.add(this.head, new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), browC, [x, 0.07, 0.175], [1.1, 1, 0.7], false)
      brow.rotation.z = x > 0 ? -0.2 : 0.2
    }
    this.add(this.head, new THREE.SphereGeometry(0.04, 8, 6), skin, [0, -0.02, 0.2], [0.7, 0.9, 0.85], false)
    const mouth = this.add(this.head, new THREE.CapsuleGeometry(0.01, 0.055, 3, 6), dark, [0, -0.08, 0.185], [1, 1, 0.6], false)
    mouth.rotation.z = Math.PI / 2
    for (const x of [-0.16, 0.16]) {
      this.add(this.head, new THREE.SphereGeometry(0.035, 8, 6), skin, [x, 0, 0.02], [0.7, 1.1, 0.8], false)
    }
  }

  private buildHumanoid(): void {
    const p = PAL[this.kind]
    const cloth = speckled(p.primary, 0x000000, 0.22)
    const clothDark = speckled(p.secondary, 0x000000, 0.2)
    const primary = this.track(toon(p.primary, { map: cloth }))
    const secondary = this.track(toon(p.secondary, { map: clothDark }))
    const accent = this.track(toon(p.accent, { emissive: p.accent, em: 0.22 }))
    const skin = this.track(toon(p.skin))
    const metal = this.track(std(0xc5d0d6, { metal: 0.88, rough: 0.28, emissive: p.accent, em: 0.08 }))
    const copper = this.track(std(p.accent, { metal: 0.72, rough: 0.32, emissive: p.accent, em: 0.18 }))
    const hairM = this.track(toon(p.hair))
    const leather = this.track(toon(0x4a3428, { map: speckled(0x4a3428, 0x1a1008, 0.3) }))

    this.bulk = this.kind === 'warden' ? 1.08 : this.kind === 'scout' ? 0.92 : 1
    this.tall = this.kind === 'mystic' ? 1.04 : 1
    this.body.scale.set(this.bulk, this.tall, this.bulk)

    this.body.add(this.hip)
    this.hip.position.y = 0.98
    this.add(this.hip, new THREE.SphereGeometry(0.26, 14, 12), primary, [0, 0, 0], [1.25, 0.7, 0.95])

    // legs
    this.legL.position.set(-0.15, 0.96, 0)
    this.legR.position.set(0.15, 0.96, 0)
    for (const [leg, shin, sign] of [
      [this.legL, this.shinL, -1],
      [this.legR, this.shinR, 1],
    ] as const) {
      this.add(leg, new THREE.CapsuleGeometry(0.1, 0.32, 6, 12), primary, [0, -0.2, 0])
      shin.position.set(0, -0.4, 0)
      this.add(shin, new THREE.SphereGeometry(0.09, 10, 8), primary)
      this.add(shin, new THREE.CapsuleGeometry(0.085, 0.3, 6, 12), secondary, [0, -0.22, 0])
      const boot = this.add(shin, new THREE.CapsuleGeometry(0.1, 0.1, 5, 10), leather, [0, -0.44, 0.06], [1.05, 0.75, 1.45])
      boot.rotation.x = 0.15
      this.add(shin, new THREE.SphereGeometry(0.04, 8, 6), copper, [0, -0.38, 0.14], undefined, false)
      leg.add(shin)
      this.body.add(leg)
      void sign
    }

    // torso
    this.torso.position.y = 1.12
    this.body.add(this.torso)
    this.add(
      this.torso,
      lathe([
        [0.14, 0],
        [0.3, 0.06],
        [0.34, 0.32],
        [0.3, 0.55],
        [0.2, 0.72],
        [0.12, 0.8],
      ]),
      primary,
    )
    this.add(this.torso, new THREE.TorusGeometry(0.28, 0.04, 8, 20), copper, [0, 0.1, 0], undefined, false)

    if (this.kind === 'warden') {
      for (const x of [-0.4, 0.4]) {
        const pad = this.add(this.torso, new THREE.SphereGeometry(0.2, 12, 10), metal, [x, 0.58, 0], [1.15, 0.65, 1.05])
        pad.rotation.z = x > 0 ? -0.35 : 0.35
        this.add(this.torso, new THREE.ConeGeometry(0.05, 0.16, 6), copper, [x * 1.05, 0.72, 0], undefined, false)
      }
      this.add(this.torso, new THREE.SphereGeometry(0.22, 12, 10), metal, [0, 0.38, 0.16], [1.35, 1.15, 0.32])
      this.add(this.torso, new THREE.SphereGeometry(0.05, 8, 6), copper, [0, 0.4, 0.24], undefined, false)
    }

    if (this.kind === 'mystic' || this.kind === 'sage') {
      this.addCloth(this.hip, clothTube(0.22, 0.64, 1.18, 18, 8), secondary, [0, 0.08, 0], 1, 'robe')
      this.add(this.torso, new THREE.TorusGeometry(0.18, 0.05, 8, 16), accent, [0, 0.7, 0])
      if (this.kind === 'mystic') {
        this.add(this.torso, new THREE.TorusGeometry(0.22, 0.015, 6, 20), this.track(toon(p.accent, { emissive: p.accent, em: 0.55 })), [0, 0.42, 0], undefined, false)
      }
    }

    if (this.kind === 'scout') {
      this.cape.position.set(0, 0.62, -0.1)
      this.cape.rotation.x = 0.12
      this.torso.add(this.cape)
      this.addCloth(this.cape, clothPlane(0.92, 1.22, 8, 10), secondary, [0, 0, 0], 1.15, 'cape')
      this.add(this.torso, new THREE.CylinderGeometry(0.07, 0.09, 0.38, 8), leather, [0.22, 0.28, -0.2])
      for (let i = 0; i < 5; i++) {
        this.add(this.torso, new THREE.CylinderGeometry(0.012, 0.008, 0.42, 5), this.track(std(0xc5a060, { metal: 0.4, rough: 0.5 })), [0.22, 0.48, -0.2 + (i - 2) * 0.03], undefined, false)
      }
    }

    if (this.kind === 'warden') {
      this.cape.position.set(0, 0.55, -0.08)
      this.cape.rotation.x = 0.16
      this.torso.add(this.cape)
      this.addCloth(this.cape, clothPlane(0.78, 1.05, 7, 9), secondary, [0, 0, 0], 0.95, 'cape')
    }

    // arms
    this.armL.position.set(-0.4, 1.62, 0)
    this.armR.position.set(0.4, 1.62, 0)
    for (const [arm, forearm, sign] of [
      [this.armL, this.forearmL, -1],
      [this.armR, this.forearmR, 1],
    ] as const) {
      this.add(arm, new THREE.SphereGeometry(0.11, 10, 8), this.kind === 'warden' ? metal : primary)
      this.add(arm, new THREE.CapsuleGeometry(0.075, 0.26, 5, 10), primary, [0, -0.2, 0])
      forearm.position.set(0, -0.38, 0)
      this.add(forearm, new THREE.SphereGeometry(0.07, 8, 8), primary)
      this.add(forearm, new THREE.CapsuleGeometry(0.065, 0.24, 5, 10), secondary, [0, -0.18, 0])
      this.add(forearm, new THREE.SphereGeometry(0.07, 8, 8), skin, [0, -0.36, 0])
      arm.add(forearm)
      arm.rotation.z = sign * 0.12
      this.body.add(arm)
    }

    this.weapon.position.set(0, -0.38, 0)
    this.forearmR.add(this.weapon)
    const steel = this.track(std(0xe8eef2, { metal: 0.96, rough: 0.14, emissive: 0x8ab0c0, em: 0.08 }))
    if (this.kind === 'warden') {
      this.buildBlade(1.12, 0.09, steel, copper)
      const shield = new THREE.Group()
      shield.position.set(0, -0.32, 0.12)
      this.forearmL.add(shield)
      this.add(shield, new THREE.CylinderGeometry(0.28, 0.3, 0.06, 6), metal, [0, 0, 0], [0.85, 1, 1.15])
      this.add(shield, new THREE.CylinderGeometry(0.12, 0.12, 0.07, 6), copper, [0, 0.02, 0], undefined, false)
    } else if (this.kind === 'mystic') {
      this.add(this.weapon, new THREE.CylinderGeometry(0.03, 0.04, 1.2, 10), this.track(std(0x9aa7b0, { metal: 0.45, rough: 0.4 })), [0, -0.42, 0])
      this.add(this.weapon, new THREE.SphereGeometry(0.13, 14, 12), this.track(toon(p.accent, { emissive: p.accent, em: 0.75 })), [0, 0.22, 0])
      this.orbit.position.set(0, 0.22, 0)
      this.weapon.add(this.orbit)
      const shard = this.add(this.orbit, new THREE.OctahedronGeometry(0.05, 0), this.track(toon(0xe8a87c, { emissive: 0xe8a87c, em: 0.7 })), [0.2, 0, 0], undefined, false)
      shard.castShadow = false
      this.tip.position.set(0, -1.05, 0)
      this.weapon.add(this.tip)
    } else if (this.kind === 'scout') {
      const bow = this.add(this.torso, new THREE.TorusGeometry(0.32, 0.022, 8, 22, Math.PI * 1.15), copper, [0.08, 0.28, -0.24])
      bow.rotation.set(0.15, Math.PI / 2, 0.35)
      this.add(this.torso, new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6), leather, [0.08, 0.28, -0.24], undefined, false)
      this.buildBlade(0.72, 0.07, steel, copper)
    } else {
      this.add(this.weapon, new THREE.CylinderGeometry(0.028, 0.035, 1.05, 8), this.track(std(0xb8a070, { metal: 0.35, rough: 0.45 })), [0, -0.4, 0])
      this.add(this.weapon, new THREE.SphereGeometry(0.07, 10, 8), copper, [0, 0.18, 0])
      this.tip.position.set(0, -0.95, 0)
      this.weapon.add(this.tip)
    }

    // head
    this.head.position.y = 1.98
    this.body.add(this.head)
    this.add(this.head, new THREE.SphereGeometry(0.22, 16, 14), skin)
    this.sculptFace(p.iris, skin)

    if (this.kind === 'warden') {
      this.add(this.head, new THREE.SphereGeometry(0.24, 14, 12), metal, [0, 0.06, -0.02], [1.08, 0.78, 1.1])
      this.add(this.head, new THREE.BoxGeometry(0.22, 0.035, 0.08), this.track(toon(p.accent, { emissive: p.accent, em: 0.45 })), [0, 0.04, 0.2], undefined, false)
      this.add(this.head, new THREE.SphereGeometry(0.06, 8, 6), copper, [0, 0.22, 0], undefined, false)
    } else if (this.kind === 'mystic') {
      const hood = this.add(this.head, new THREE.SphereGeometry(0.28, 14, 12), primary, [0, 0.08, -0.04], [1.1, 0.85, 1.2])
      hood.rotation.x = -0.15
      this.add(this.head, lathe([
        [0.02, 0],
        [0.16, 0.02],
        [0.2, 0.12],
        [0.12, 0.22],
      ], 12), hairM, [0, 0.08, -0.08])
    } else if (this.kind === 'scout') {
      this.add(this.head, new THREE.SphereGeometry(0.24, 12, 10), hairM, [0, 0.08, -0.02], [1.05, 0.7, 1.1])
      this.ponytail.position.set(0, 0.06, -0.2)
      this.head.add(this.ponytail)
      this.add(this.ponytail, new THREE.CapsuleGeometry(0.05, 0.2, 5, 8), hairM, [0, -0.1, -0.02])
      this.pony2.position.set(0, -0.22, -0.03)
      this.ponytail.add(this.pony2)
      this.add(this.pony2, new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), hairM, [0, -0.1, -0.02])
      const hood = this.add(this.head, new THREE.SphereGeometry(0.26, 12, 10), primary, [0, 0.1, -0.06], [1.08, 0.65, 1.15])
      hood.rotation.x = -0.2
    } else if (this.kind === 'sage') {
      this.add(this.head, new THREE.TorusGeometry(0.18, 0.045, 8, 16), hairM, [0, 0.14, 0])
      for (const [x, z] of [
        [0, 0.16],
        [-0.08, 0.14],
        [0.08, 0.14],
        [0, 0.1],
      ] as const) {
        this.add(this.head, new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), hairM, [x, -0.18, z], [1, 1, 0.8], false)
      }
    }
  }

  private buildBeetle(): void {
    const p = PAL.beetle
    const shell = this.track(toon(p.primary, { map: speckled(p.primary, 0x1a1008, 0.25) }))
    const dark = this.track(toon(p.secondary))
    const gem = this.track(toon(p.accent, { emissive: 0x5eb1bf, em: 0.5 }))
    const metal = this.track(std(p.accent, { metal: 0.7, rough: 0.3, emissive: p.accent, em: 0.15 }))

    this.add(this.body, new THREE.SphereGeometry(0.42, 16, 12), shell, [0, 0.42, -0.12], [1.15, 0.85, 1.45])
    this.add(this.body, new THREE.SphereGeometry(0.32, 14, 10), this.track(std(p.secondary, { metal: 0.45, rough: 0.4 })), [0, 0.58, -0.18], [1.2, 0.45, 1.3])
    this.add(this.body, new THREE.SphereGeometry(0.12, 10, 8), gem, [0, 0.62, 0.08])
    this.add(this.body, new THREE.SphereGeometry(0.28, 12, 10), dark, [0, 0.38, 0.42], [1.05, 0.85, 1])

    this.head.position.set(0, 0.48, 0.55)
    this.add(this.head, new THREE.SphereGeometry(0.22, 12, 10), shell)
    for (const x of [-0.1, 0.1]) {
      this.add(this.head, new THREE.SphereGeometry(0.05, 8, 6), this.track(toon(0x1a1008, { emissive: p.accent, em: 0.35 })), [x, 0.04, 0.16], undefined, false)
      const mandible = this.add(this.head, new THREE.CapsuleGeometry(0.03, 0.18, 4, 6), metal, [x, -0.06, 0.2])
      mandible.rotation.z = x > 0 ? -0.5 : 0.5
      mandible.rotation.x = 0.4
    }
    const antL = new THREE.Group()
    const antR = new THREE.Group()
    antL.position.set(-0.08, 0.16, 0.08)
    antR.position.set(0.08, 0.16, 0.08)
    this.add(antL, new THREE.CapsuleGeometry(0.015, 0.28, 3, 6), dark, [0, 0.14, 0])
    this.add(antR, new THREE.CapsuleGeometry(0.015, 0.28, 3, 6), dark, [0, 0.14, 0])
    this.add(antL, new THREE.SphereGeometry(0.035, 8, 6), gem, [0, 0.3, 0], undefined, false)
    this.add(antR, new THREE.SphereGeometry(0.035, 8, 6), gem, [0, 0.3, 0], undefined, false)
    this.head.add(antL, antR)
    this.body.add(this.head)

    for (const x of [-0.34, 0.34]) {
      for (const [i, z] of [-0.28, -0.02, 0.24].entries()) {
        const leg = new THREE.Group()
        leg.position.set(x, 0.28, z)
        this.add(leg, new THREE.CapsuleGeometry(0.04, 0.32, 4, 8), dark, [x > 0 ? 0.12 : -0.12, -0.12, 0])
        this.add(leg, new THREE.CapsuleGeometry(0.03, 0.22, 3, 6), shell, [x > 0 ? 0.28 : -0.28, -0.28, 0])
        leg.rotation.z = x > 0 ? -0.85 : 0.85
        this.body.add(leg)
        this.beetleLegs.push(leg)
        void i
      }
    }
    this.legL.position.set(-0.2, 0.2, 0)
    this.legR.position.set(0.2, 0.2, 0)
    this.armL.position.set(-0.25, 0.45, 0.2)
    this.armR.position.set(0.25, 0.45, 0.2)
    this.body.add(this.legL, this.legR, this.armL, this.armR)
  }

  private buildWraith(): void {
    const p = PAL.wraith
    const mist = this.track(std(p.primary, { rough: 0.35, em: 0.28, emissive: p.accent, opacity: 0.72 }))
    const core = this.track(toon(p.accent, { emissive: p.accent, em: 0.55 }))
    const veil = this.track(std(p.secondary, { rough: 0.25, em: 0.2, emissive: p.accent, opacity: 0.4 }))

    this.addCloth(this.body, clothTube(0.16, 0.52, 1.8, 16, 8), mist, [0, 1.82, 0], 1.1, 'robe')
    this.addCloth(this.body, clothTube(0.1, 0.34, 1.4, 14, 7), veil, [0, 1.72, 0], 0.85, 'robe')
    this.add(this.body, new THREE.SphereGeometry(0.16, 12, 10), core, [0, 1.15, 0])

    for (let i = 0; i < 4; i++) {
      const ring = this.add(
        this.body,
        new THREE.TorusGeometry(0.22 + i * 0.07, 0.018, 6, 20),
        this.track(toon(p.accent, { emissive: p.accent, em: 0.4 })),
        [0, 0.45 + i * 0.32, 0],
        undefined,
        false,
      )
      ring.rotation.x = Math.PI / 2
      ring.rotation.z = i * 0.2
    }

    this.head.position.y = 1.78
    this.add(this.head, new THREE.SphereGeometry(0.26, 16, 14), this.track(toon(p.skin, { emissive: p.accent, em: 0.25 })))
    this.sculptFace(p.iris, this.track(toon(p.skin)))
    const hood = this.add(this.head, new THREE.SphereGeometry(0.32, 14, 12), mist, [0, 0.08, -0.06], [1.1, 0.8, 1.2], false)
    hood.rotation.x = -0.2
    this.body.add(this.head)

    this.armL.position.set(-0.38, 1.35, 0)
    this.armR.position.set(0.38, 1.35, 0)
    for (const [arm, sign] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      this.add(arm, new THREE.CapsuleGeometry(0.06, 0.7, 5, 8), mist, [0, -0.35, 0], undefined, false)
      this.add(arm, new THREE.SphereGeometry(0.08, 8, 8), core, [0, -0.72, 0], undefined, false)
      arm.rotation.z = sign * 0.25
      this.body.add(arm)
    }
    this.legL.position.set(-0.1, 0.3, 0)
    this.legR.position.set(0.1, 0.3, 0)
    this.body.add(this.legL, this.legR)
  }

  private buildGolem(): void {
    const p = PAL.golem
    const stone = this.track(toon(p.primary, { map: speckled(p.primary, 0x1a2024, 0.35) }))
    const dark = this.track(toon(p.secondary))
    const vein = this.track(toon(p.accent, { emissive: p.accent, em: 0.65 }))

    const torso = this.add(this.body, rocky(new THREE.IcosahedronGeometry(0.82, 1), 0.12), stone, [0, 1.4, 0], [1.2, 1.35, 0.95])
    void torso
    this.add(this.body, rocky(new THREE.IcosahedronGeometry(0.35, 0), 0.08), dark, [-0.45, 1.7, 0.25], [1.2, 0.8, 0.9])
    this.add(this.body, rocky(new THREE.IcosahedronGeometry(0.28, 0), 0.08), dark, [0.5, 1.15, 0.2])
    this.add(this.body, new THREE.CapsuleGeometry(0.07, 1.15, 4, 8), vein, [0, 1.4, 0.15], undefined, false)
    this.add(this.body, new THREE.CapsuleGeometry(0.05, 0.7, 4, 6), vein, [0.2, 1.5, 0.1], [1, 1, 1], false).rotation.z = 0.4

    this.head.position.y = 2.42
    this.add(this.head, rocky(new THREE.IcosahedronGeometry(0.4, 1), 0.08), stone, [0, 0, 0], [1.1, 0.95, 1])
    this.add(this.head, new THREE.BoxGeometry(0.28, 0.06, 0.08), vein, [0, 0.02, 0.32], undefined, false)
    for (const x of [-0.1, 0.1]) {
      this.add(this.head, new THREE.SphereGeometry(0.055, 8, 6), this.track(toon(p.accent, { emissive: p.accent, em: 0.8 })), [x, 0.06, 0.3], undefined, false)
    }
    this.body.add(this.head)

    this.armL.position.set(-0.95, 1.65, 0)
    this.armR.position.set(0.95, 1.65, 0)
    for (const [arm, sign] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      this.add(arm, rocky(new THREE.CapsuleGeometry(0.2, 0.55, 4, 8), 0.06), stone, [0, -0.3, 0])
      this.add(arm, rocky(new THREE.IcosahedronGeometry(0.28, 0), 0.07), dark, [0, -0.72, 0])
      this.add(arm, new THREE.SphereGeometry(0.08, 8, 6), vein, [0, -0.72, 0.18], undefined, false)
      arm.rotation.z = sign * 0.12
      this.body.add(arm)
    }
    this.legL.position.set(-0.32, 0.7, 0)
    this.legR.position.set(0.32, 0.7, 0)
    this.legL.add(this.shinL)
    this.legR.add(this.shinR)
    this.add(this.legL, rocky(new THREE.CapsuleGeometry(0.2, 0.4, 4, 8), 0.05), stone, [0, -0.22, 0])
    this.add(this.legR, rocky(new THREE.CapsuleGeometry(0.2, 0.4, 4, 8), 0.05), stone, [0, -0.22, 0])
    this.add(this.shinL, rocky(new THREE.IcosahedronGeometry(0.22, 0), 0.05), dark, [0, -0.55, 0.05])
    this.add(this.shinR, rocky(new THREE.IcosahedronGeometry(0.22, 0), 0.05), dark, [0, -0.55, 0.05])
    this.body.add(this.legL, this.legR)
  }

  setWorld(x: number, z: number, facing: number, y = 0): void {
    this.root.position.set(x, y, z)
    this.root.rotation.y = -facing + Math.PI / 2
  }

  faceCamera(_camera: THREE.Camera): void {}

  setAnim(anim: ActorAnim, force = false): void {
    if (this.anim === anim && !force) return
    if (this.anim === 'attack' && anim !== 'attack' && this.animT < this.attackLen && !force) return
    if (this.anim === 'dodge' && anim !== 'dodge' && this.animT < 0.24 && !force) return
    const started = this.anim !== anim
    this.anim = anim
    if (started && (anim === 'attack' || anim === 'dodge')) {
      this.animT = 0
      if (anim === 'attack') {
        this.swayV.x += this.kind === 'warden' || this.kind === 'scout' ? 5.5 : 3.2
        this.swayV.y -= 2.2
      } else {
        this.swayV.y += 6
      }
    }
  }

  update(dt: number, moving: boolean): void {
    this.animT += dt
    this.flash = Math.max(0, this.flash - dt)
    this.attackLen = this.kind === 'golem' ? 0.62 : this.kind === 'scout' ? 0.38 : this.kind === 'mystic' ? 0.52 : 0.54

    if (this.anim === 'attack' && this.animT > this.attackLen) this.anim = moving ? 'walk' : 'idle'
    if (this.anim === 'dodge' && this.animT > 0.26) this.anim = moving ? 'walk' : 'idle'
    if (this.anim !== 'attack' && this.anim !== 'dodge') this.anim = moving ? 'walk' : 'idle'

    const speed = this.kind === 'golem' ? 5.2 : this.kind === 'beetle' ? 11 : this.kind === 'wraith' ? 7 : 9.2
    this.phase += dt * (this.anim === 'walk' ? speed : this.anim === 'idle' ? 2.1 : 13)
    const swing = Math.sin(this.phase)

    this.legL.rotation.set(0, 0, 0)
    this.legR.rotation.set(0, 0, 0)
    this.shinL.rotation.set(0, 0, 0)
    this.shinR.rotation.set(0, 0, 0)
    this.armL.rotation.set(0, 0, this.kind === 'wraith' ? -0.25 : -0.12)
    this.armR.rotation.set(0, 0, this.kind === 'wraith' ? 0.25 : 0.12)
    this.forearmL.rotation.set(0.12, 0, 0)
    this.forearmR.rotation.set(0.12, 0, 0)
    this.torso.rotation.set(0, 0, 0)
    this.hip.rotation.set(0, 0, 0)
    this.head.rotation.set(-0.08, 0, 0)
    this.body.position.set(0, this.kind === 'wraith' ? 0.12 : 0, 0)
    this.body.rotation.set(0, 0, 0)
    this.body.scale.set(this.bulk, this.tall, this.bulk)
    this.cape.rotation.set(0.12, 0, 0)
    this.ponytail.rotation.set(0.15, 0, 0)
    this.pony2.rotation.set(0.08, 0, 0)
    this.weapon.rotation.set(-0.55, 0, 0.12)
    this.orbit.rotation.y += dt * 2.4

    let wind = 0
    let strike = 0
    let rec = 0
    let arc = 0
    if (this.anim === 'attack') {
      const u = Math.min(1, this.animT / this.attackLen)
      const windEnd = this.kind === 'scout' ? 0.28 : this.kind === 'golem' ? 0.4 : 0.34
      const swingEnd = this.kind === 'scout' ? 0.5 : this.kind === 'golem' ? 0.62 : 0.52
      if (u < windEnd) {
        wind = easeOut(u / windEnd)
      } else if (u < swingEnd) {
        strike = 1
        arc = easeOut((u - windEnd) / (swingEnd - windEnd))
      } else {
        arc = 1
        rec = easeOut((u - swingEnd) / Math.max(0.001, 1 - swingEnd))
      }
    }

    if (this.kind === 'beetle') this.poseBeetle(swing, wind, arc)
    else if (this.kind === 'wraith') this.poseWraith(swing, wind, arc)
    else if (this.anim === 'walk') this.poseWalk(swing)
    else if (this.anim === 'idle') this.poseIdle()
    else if (this.anim === 'attack') this.poseAttack(wind, arc, rec)
    else if (this.anim === 'dodge') this.poseDodge()

    this.updateCloth(dt, swing, wind, strike)
    this.updateTrail(this.anim === 'attack' && strike > 0)
    this.updateFlash()
  }

  private poseWalk(swing: number): void {
    const robe = this.kind === 'mystic' || this.kind === 'sage'
    const stride = robe ? 0.18 : 0.62
    const shinRest = robe ? 0.08 : 0.18
    const shinKick = robe ? 0.2 : 0.7
    this.legL.rotation.x = swing * stride
    this.legR.rotation.x = -swing * stride
    this.shinL.rotation.x = shinRest + Math.max(0, swing) * shinKick
    this.shinR.rotation.x = shinRest + Math.max(0, -swing) * shinKick
    this.armL.rotation.x = -swing * 0.48
    this.armR.rotation.x = swing * 0.35
    this.armR.rotation.z = 0.22
    this.forearmL.rotation.x = 0.25 + Math.max(0, -swing) * 0.25
    this.forearmR.rotation.x = 0.35 + Math.max(0, swing) * 0.15
    this.weapon.rotation.set(-0.65, 0, 0.1)
    this.body.position.y = Math.abs(swing) * 0.04
    this.torso.rotation.y = swing * 0.08
    this.torso.rotation.z = swing * 0.03
    this.hip.rotation.y = swing * 0.05
    this.head.rotation.y = -swing * 0.06
    this.cape.rotation.x = 0.18 + Math.abs(swing) * 0.1
    this.ponytail.rotation.x = 0.22 + Math.abs(swing) * 0.2
    this.pony2.rotation.x = 0.12 + Math.abs(swing) * 0.28
  }

  private poseIdle(): void {
    this.armL.rotation.x = Math.sin(this.phase) * 0.06
    this.armR.rotation.x = -Math.sin(this.phase) * 0.05
    this.armR.rotation.z = 0.22
    this.forearmR.rotation.x = 0.38
    this.weapon.rotation.set(-0.62, 0, 0.12)
    this.head.rotation.y = Math.sin(this.phase * 0.4) * 0.18
    this.body.position.y = Math.sin(this.phase) * 0.015
    this.torso.rotation.x = Math.sin(this.phase) * 0.02
    this.cape.rotation.x = 0.12 + Math.sin(this.phase * 0.8) * 0.04
    this.ponytail.rotation.x = 0.15 + Math.sin(this.phase) * 0.08
    this.pony2.rotation.x = 0.1 + Math.sin(this.phase * 1.3) * 0.12
  }

  private poseDodge(): void {
    this.body.scale.set(this.bulk * 1.08, this.tall * 0.86, this.bulk * 1.08)
    this.body.rotation.x = 0.42
    this.legL.rotation.x = 0.55
    this.legR.rotation.x = 0.55
    this.shinL.rotation.x = 0.65
    this.shinR.rotation.x = 0.65
    this.armL.rotation.x = 0.45
    this.armR.rotation.x = 0.45
    this.cape.rotation.x = 0.55
    this.ponytail.rotation.x = 0.7
    this.pony2.rotation.x = 0.5
  }

  private poseAttack(wind: number, arc: number, rec: number): void {
    if (this.kind === 'golem') {
      this.armR.rotation.set(-2.35 * (1 - arc) + 0.7 * arc, 0, 0.15)
      this.armL.rotation.set(-2.25 * (1 - arc) + 0.65 * arc, 0, -0.15)
      this.torso.rotation.x = -0.38 * (1 - arc) + 0.5 * arc
      this.head.rotation.x = -0.2 * (1 - arc) + 0.25 * arc
      this.body.position.y = 0.28 * (1 - arc) - 0.08 * arc
      this.legL.rotation.x = 0.3 * (1 - arc) - 0.2 * arc
      this.legR.rotation.x = 0.3 * (1 - arc) + 0.4 * arc
      this.shinL.rotation.x = 0.5 * (1 - arc)
      this.shinR.rotation.x = 0.5 * (1 - arc) + 0.25 * arc
      return
    }

    if (this.kind === 'mystic' || this.kind === 'sage') {
      this.poseCast(wind, arc, rec)
      return
    }

    const slash: SlashKey[] =
      this.kind === 'scout'
        ? [
            { t: 0, arm: [0.55, 0.25, 0.95], fore: -0.95, weap: [-0.25, 0.1, 0.2], torsoY: -0.4, armL: [-0.4, 0, -0.3], legL: 0.15, legR: -0.12 },
            { t: 0.45, arm: [-1.25, 0.08, 0.5], fore: -0.15, weap: [0.1, 0, 0.05], torsoY: 0.12, armL: [-0.55, 0, -0.12], legL: -0.12, legR: 0.22 },
            { t: 1, arm: [-1.15, -0.15, -0.35], fore: 0.18, weap: [0.4, -0.08, -0.08], torsoY: 0.42, armL: [-0.2, 0, 0.08], legL: -0.28, legR: 0.35 },
          ]
        : [
            { t: 0, arm: [0.65, 0.3, 1.05], fore: -1.1, weap: [-0.3, 0.18, 0.22], torsoY: -0.48, armL: [-0.45, 0, -0.4], legL: 0.22, legR: -0.18 },
            { t: 0.42, arm: [-1.4, 0.08, 0.52], fore: -0.18, weap: [0.08, 0.04, 0.06], torsoY: 0.18, armL: [-0.65, 0, -0.18], legL: -0.1, legR: 0.2 },
            { t: 1, arm: [-1.2, -0.18, -0.38], fore: 0.16, weap: [0.42, -0.1, -0.12], torsoY: 0.5, armL: [-0.22, 0, 0.1], legL: -0.32, legR: 0.4 },
          ]

    const restArm: [number, number, number] = [0, 0, 0.22]
    const restFore = 0.38
    const restWeap: [number, number, number] = [-0.62, 0, 0.12]
    const restArmL: [number, number, number] = [0, 0, -0.12]

    if (wind > 0 && arc < 0.02) {
      this.applySlash(restArm, slash[0].arm, restFore, slash[0].fore, restWeap, slash[0].weap, restArmL, slash[0].armL, 0, slash[0].torsoY, 0, slash[0].legL, 0, slash[0].legR, wind)
      return
    }
    const p = sampleSlash(slash, arc)
    const fade = rec > 0 ? 1 - rec : 1
    this.applySlash(restArm, p.arm, restFore, p.fore, restWeap, p.weap, restArmL, p.armL, 0, p.torsoY, 0, p.legL, 0, p.legR, fade)
  }

  private poseCast(wind: number, arc: number, rec: number): void {
    const fade = rec > 0 ? 1 - rec : 1
    if (wind > 0 && arc < 0.02) {
      const t = wind
      this.armR.rotation.set(-1.15 * t, 0.18 * t, 0.32 * t)
      this.forearmR.rotation.x = -0.5 * t
      this.weapon.rotation.set(0.55 * t, 0, 0.12 * t)
      this.armL.rotation.set(-0.9 * t, 0, -0.38 * t)
      this.torso.rotation.set(-0.16 * t, -0.1 * t, 0)
      this.head.rotation.x = -0.08 * t
      this.legL.rotation.x = 0.08 * t
      this.legR.rotation.x = -0.06 * t
      return
    }
    this.armR.rotation.set(lerp(-1.15, -1.62, arc), lerp(0.18, 0.04, arc), lerp(0.32, 0.06, arc))
    this.forearmR.rotation.x = lerp(-0.5, 0.3, arc)
    this.weapon.rotation.set(lerp(0.55, 0.06, arc), 0, lerp(0.12, 0, arc))
    this.armL.rotation.set(lerp(-0.9, -0.4, arc), 0, lerp(-0.38, 0.08, arc))
    this.torso.rotation.set(lerp(-0.16, 0.1, arc), lerp(-0.1, 0.16, arc), 0)
    this.head.rotation.x = lerp(-0.08, 0.12, arc)
    this.legL.rotation.x = lerp(0.08, -0.18, arc)
    this.legR.rotation.x = lerp(-0.06, 0.2, arc)
    if (fade < 1) {
      this.armR.rotation.x *= fade
      this.armR.rotation.y *= fade
      this.armR.rotation.z *= fade
      this.forearmR.rotation.x *= fade
      this.weapon.rotation.x *= fade
      this.armL.rotation.x *= fade
      this.armL.rotation.z *= fade
      this.torso.rotation.x *= fade
      this.torso.rotation.y *= fade
    }
  }

  private applySlash(
    a0: [number, number, number],
    a1: [number, number, number],
    f0: number,
    f1: number,
    w0: [number, number, number],
    w1: [number, number, number],
    l0: [number, number, number],
    l1: [number, number, number],
    ty0: number,
    ty1: number,
    ll0: number,
    ll1: number,
    lr0: number,
    lr1: number,
    t: number,
  ): void {
    this.armR.rotation.set(lerp(a0[0], a1[0], t), lerp(a0[1], a1[1], t), lerp(a0[2], a1[2], t))
    this.forearmR.rotation.x = lerp(f0, f1, t)
    this.weapon.rotation.set(lerp(w0[0], w1[0], t), lerp(w0[1], w1[1], t), lerp(w0[2], w1[2], t))
    this.armL.rotation.set(lerp(l0[0], l1[0], t), lerp(l0[1], l1[1], t), lerp(l0[2], l1[2], t))
    this.torso.rotation.y = lerp(ty0, ty1, t)
    this.torso.rotation.x = -0.12 * t
    this.hip.rotation.y = this.torso.rotation.y * 0.3
    this.head.rotation.y = -this.torso.rotation.y * 0.35
    this.legL.rotation.x = lerp(ll0, ll1, t)
    this.legR.rotation.x = lerp(lr0, lr1, t)
    this.shinR.rotation.x = 0.15 + Math.max(0, this.legR.rotation.x) * 0.4
    this.cape.rotation.x = 0.14 + 0.3 * t
    this.cape.rotation.z = this.torso.rotation.y * 0.25
  }

  private updateTrail(active: boolean): void {
    if (!this.trailMesh || !this.trailGeo) return
    this.tip.getWorldPosition(this._v)
    if (active) {
      const last = this.trailHist[this.trailHist.length - 1]
      if (!last || last.distanceToSquared(this._v) > 0.002) this.trailHist.push(this._v.clone())
      if (this.trailHist.length > 16) this.trailHist.shift()
    } else if (this.trailHist.length) {
      this.trailHist.shift()
      if (this.trailHist.length) this.trailHist.shift()
    }
    const n = this.trailHist.length
    if (n < 2) {
      this.trailMesh.visible = false
      return
    }
    this.trailMesh.visible = true
    const pos = this.trailGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < n; i++) {
      this._v.copy(this.trailHist[i])
      this.root.worldToLocal(this._v)
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(n - 1, i + 1)
      this._v2.copy(this.trailHist[i1])
      this.root.worldToLocal(this._v2)
      this._v3.copy(this.trailHist[i0])
      this.root.worldToLocal(this._v3)
      this._v2.sub(this._v3)
      this._v3.set(0, 1, 0).cross(this._v2)
      if (this._v3.lengthSq() < 1e-6) this._v3.set(1, 0, 0)
      else this._v3.normalize()
      const w = 0.07 + (i / (n - 1)) * 0.38
      pos.setXYZ(i * 2, this._v.x + this._v3.x * w, this._v.y + this._v3.y * w, this._v.z + this._v3.z * w)
      pos.setXYZ(i * 2 + 1, this._v.x - this._v3.x * w, this._v.y - this._v3.y * w, this._v.z - this._v3.z * w)
    }
    pos.needsUpdate = true
    this.trailGeo.setDrawRange(0, (n - 1) * 6)
    const mat = this.trailMesh.material as THREE.MeshBasicMaterial
    mat.opacity = active ? 0.9 : 0.45
  }

  private poseBeetle(swing: number, wind: number, strike: number): void {
    this.beetleLegs.forEach((leg, i) => {
      const s = Math.sin(this.phase * 1.4 + i * 1.1)
      const side = leg.position.x > 0 ? -1 : 1
      leg.rotation.z = side * (0.75 + (this.anim === 'walk' ? s * 0.28 : 0.05) + wind * 0.15)
      leg.rotation.x = this.anim === 'walk' ? s * 0.22 : strike * 0.35
    })
    this.head.rotation.y = this.anim === 'idle' ? Math.sin(this.phase * 0.5) * 0.2 : 0
    this.head.rotation.x = -0.25 * wind + 0.2 * strike
    this.body.position.y = this.anim === 'walk' ? Math.abs(swing) * 0.04 : Math.sin(this.phase) * 0.015
    this.body.position.y += 0.16 * wind
    this.body.rotation.x = -0.28 * wind + 0.35 * strike
    this.body.position.z = 0.28 * strike
  }

  private poseWraith(swing: number, wind: number, strike: number): void {
    this.body.position.y = 0.14 + Math.sin(this.phase) * 0.06 + 0.18 * wind
    this.armL.rotation.x = Math.sin(this.phase * 0.7) * 0.15 - 1.35 * wind - 0.9 * strike
    this.armR.rotation.x = -Math.sin(this.phase * 0.7) * 0.15 - 1.35 * wind - 0.9 * strike
    this.armL.rotation.z = -0.25 - 0.55 * wind + 0.2 * strike
    this.armR.rotation.z = 0.25 + 0.55 * wind - 0.2 * strike
    if (this.anim === 'walk') this.body.rotation.y = swing * 0.08
    this.body.rotation.x = -0.15 * wind + 0.4 * strike
    this.body.position.z = 0.22 * strike
    this.head.rotation.x = -0.2 * wind + 0.15 * strike
  }

  private updateCloth(dt: number, _swing: number, wind: number, strike: number): void {
    let tx = 0
    let tz = 0.07
    if (this.anim === 'walk') {
      tx = Math.sin(this.phase) * 0.14
      tz = 0.2 + Math.abs(Math.sin(this.phase)) * 0.08
    } else if (this.anim === 'idle') {
      tx = Math.sin(this.phase * 0.7) * 0.04
      tz = 0.07 + Math.sin(this.phase) * 0.03
    } else if (this.anim === 'attack') {
      tx = -0.18 * wind + 0.42 * strike
      tz = 0.1 + 0.12 * wind + 0.22 * strike
    } else if (this.anim === 'dodge') {
      tx = 0
      tz = 0.48
    }
    const stiff = 18
    const damp = 7
    this.swayV.x += ((tx - this.sway.x) * stiff - this.swayV.x * damp) * dt
    this.swayV.y += ((tz - this.sway.y) * stiff - this.swayV.y * damp) * dt
    this.sway.x += this.swayV.x * dt
    this.sway.y += this.swayV.y * dt

    const flutter = this.anim === 'idle' ? 0.025 : this.anim === 'walk' ? 0.045 : 0.06
    for (const c of this.cloth) {
      const geo = c.mesh.geometry
      const rest = geo.userData.rest as Float32Array | undefined
      const h = (geo.userData.height as number) || 1
      if (!rest) continue
      const arr = geo.attributes.position.array as Float32Array
      for (let i = 0; i < rest.length / 3; i++) {
        const x0 = rest[i * 3]
        const y0 = rest[i * 3 + 1]
        const z0 = rest[i * 3 + 2]
        const along = Math.max(0, Math.min(1, -y0 / h))
        const w = along * along
        const flap = Math.sin(this.phase * 2.1 + x0 * 9 + y0 * 4) * flutter * along
        if (c.mode === 'cape') {
          arr[i * 3] = x0 + this.sway.x * w * c.amp + flap
          arr[i * 3 + 1] = y0
          arr[i * 3 + 2] = z0 - this.sway.y * w * c.amp + Math.sin(this.phase * 1.6 + x0 * 6) * flutter * along
        } else {
          const r = Math.hypot(x0, z0) || 0.001
          const nx = x0 / r
          const nz = z0 / r
          const flare = this.sway.y * w * c.amp * 0.55
          arr[i * 3] = x0 + nx * flare + this.sway.x * w * 0.4 * c.amp + flap * nx
          arr[i * 3 + 1] = y0
          arr[i * 3 + 2] = z0 + nz * flare + flap * nz
        }
      }
      geo.attributes.position.needsUpdate = true
      geo.computeVertexNormals()
    }
  }

  private updateFlash(): void {
    for (const m of this.mats) {
      if (m.userData.baseEm == null) {
        m.userData.baseEm = m.emissiveIntensity
        m.userData.baseEmColor = m.emissive.getHex()
      }
      if (this.flash > 0) {
        m.emissive.setHex(0xffffff)
        m.emissiveIntensity = 0.55
      } else {
        m.emissive.setHex(m.userData.baseEmColor)
        m.emissiveIntensity = m.userData.baseEm
      }
    }
  }

  pulseHit(): void {
    this.flash = 0.16
  }

  /** Keep the wind-up pose while a telegraph is live. */
  holdWind(): void {
    this.anim = 'attack'
    this.animT = this.kind === 'golem' ? 0.2 : this.kind === 'scout' ? 0.08 : 0.14
  }

  dispose(): void {
    this.dead = true
    this.outlineMat.dispose()
    this.root.traverse((o) => {
      const meshObj = o as THREE.Mesh
      if (meshObj.geometry) meshObj.geometry.dispose()
      const mat = meshObj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) (mat as THREE.Material).dispose()
    })
  }
}
