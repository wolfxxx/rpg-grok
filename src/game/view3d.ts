import * as THREE from 'three'
import {
  WORLD_H,
  WORLD_W,
  TILE,
  cols,
  PATHS,
  LANDMARKS,
  distToPath,
  buildCollision,
  blockedAt,
  ROCK_POCKETS,
  currentAct,
  storySpots,
  type WorldProp,
} from '../data/world'
import { CombatFx, type BoltSpec, type TelegraphSpec } from './combatfx'
import { Actor3D, type ActorKind } from './characters3d'
import { makeBarkTexture, makeCanopyTexture, makeWorldGroundMaps } from './worldmap'
import { heightAtWorld } from './height'
import { applyKenneySky, kenneyRock, kenneyStone, kenneyThatch, kenneyWater } from './kenney'

export type ViewSync = {
  player: {
    x: number
    y: number
    facing: number
    moving: boolean
    attacking: boolean
    slamming: boolean
    casting: boolean
    lunging: boolean
    dodging: boolean
    hitFlash: boolean
    hp: number
    maxHp: number
  }
  enemies: Array<{
    key: string
    id: ActorKind
    x: number
    y: number
    facing: number
    moving: boolean
    attacking: boolean
    recovering: boolean
    alive: boolean
    dying: number
    windup: boolean
    hp: number
    maxHp: number
    hitFlash: boolean
    dormant: boolean
    raged: boolean
  }>
  props: WorldProp[]
  healChannel: boolean
  moveMarker: { x: number; y: number; life: number } | null
  camX: number
  camY: number
  shake: number
  telegraphs: TelegraphSpec[]
  bolts: BoltSpec[]
}

function scaleWorld(n: number): number {
  // game pixels → meters
  return n * 0.04
}

function elev(wx: number, wz: number, extra = 0): number {
  return heightAtWorld(wx, wz) + extra
}

const BAR_H: Record<string, number> = {
  beetle: 1.12,
  wraith: 2.55,
  golem: 4.15,
}

class EnemyHpBar {
  root = new THREE.Group()
  private fill: THREE.Mesh
  private fillMat: THREE.MeshBasicMaterial
  private shown = 0

  constructor() {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x14080a, transparent: true, opacity: 0.82, depthTest: false }),
    )
    bg.renderOrder = 20
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0xd4453a, depthTest: false, transparent: true, opacity: 0.96 })
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.07), this.fillMat)
    this.fill.position.z = 0.002
    this.fill.renderOrder = 21
    const rim = new THREE.Mesh(
      new THREE.PlaneGeometry(0.99, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x3a1210, transparent: true, opacity: 0.9, depthTest: false }),
    )
    rim.position.z = -0.002
    rim.renderOrder = 19
    this.root.add(rim, bg, this.fill)
    this.root.visible = false
  }

  set(hp: number, maxHp: number, y: number, show: boolean, dt: number): void {
    this.shown = show ? 0.35 : Math.max(0, this.shown - dt)
    this.root.visible = this.shown > 0
    if (!this.root.visible) return
    this.root.position.y = y
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)))
    this.fill.scale.x = Math.max(0.02, ratio)
    this.fill.position.x = (ratio - 1) * 0.44
    this.fillMat.color.setHex(ratio < 0.28 ? 0x8a1c18 : 0xd4453a)
  }

  face(camera: THREE.Camera): void {
    this.root.quaternion.copy(camera.quaternion)
    this.root.position.y += 0.15
    const ox = this.root.position.x
    const oy = this.root.position.y
    const oz = this.root.position.z
    const dx = camera.position.x - ox
    const dy = camera.position.y - oy
    const dz = camera.position.z - oz
    const len = Math.hypot(dx, dy, dz) || 1
    this.root.position.set(ox + (dx / len) * 0.45, oy + (dy / len) * 0.45, oz + (dz / len) * 0.45)
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material
      if (mat) (mat as THREE.Material).dispose()
    })
  }
}

export class View3D {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  clock = new THREE.Clock()

  ground = new THREE.Mesh()
  player!: Actor3D
  enemies = new Map<string, Actor3D>()
  hpBars = new Map<string, EnemyHpBar>()
  propMeshes = new Map<string, THREE.Object3D>()
  marker: THREE.Mesh
  fx: CombatFx

  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private tmp = new THREE.Vector3()
  private follow = new THREE.Vector3()
  private campFire: THREE.PointLight | null = null
  private campFlames: THREE.Mesh[] = []

  constructor(canvas: HTMLCanvasElement, heroKind: ActorKind) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.45

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 220)

    this.buildSky()
    this.buildLights()
    this.buildGround()
    this.buildBlockers()
    this.dressWorld()

    this.player = new Actor3D(heroKind)
    this.scene.add(this.player.root)

    // local hero light so the player always reads
    const heroLight = new THREE.PointLight(0xfff2dd, 2.2, 28, 2)
    heroLight.name = 'heroLight'
    this.scene.add(heroLight)

    // move marker
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8a87c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    )
    this.marker.rotation.x = -Math.PI / 2
    this.marker.visible = false
    this.scene.add(this.marker)

    this.fx = new CombatFx(this.scene, this.makeSlashTexture())

    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private buildLights(): void {
    const dusk = currentAct === 2
    this.scene.add(new THREE.AmbientLight(dusk ? 0xb4bcc4 : 0xc8d4dc, dusk ? 0.82 : 0.95))

    const sun = new THREE.DirectionalLight(dusk ? 0xe4d4c4 : 0xfff1dc, dusk ? 1.85 : 2.15)
    sun.position.set(22, 38, 26)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 140
    sun.shadow.camera.left = -50
    sun.shadow.camera.right = 50
    sun.shadow.camera.top = 50
    sun.shadow.camera.bottom = -50
    sun.shadow.bias = -0.00025
    this.scene.add(sun)

    const rim = new THREE.DirectionalLight(dusk ? 0x8eb0bc : 0x9ec8d6, dusk ? 0.7 : 0.85)
    rim.position.set(-18, 20, -16)
    this.scene.add(rim)

    this.scene.add(new THREE.HemisphereLight(dusk ? 0xd8d0c4 : 0xf0e2c8, dusk ? 0x32383c : 0x3d4a3c, dusk ? 0.58 : 0.72))
  }

  private buildSky(): void {
    const dusk = currentAct === 2
    this.scene.background = new THREE.Color(dusk ? 0x9aa3a8 : 0xb7c4c8)
    this.scene.fog = new THREE.Fog(dusk ? 0x9aa3a8 : 0xb7c4c8, 40, 94)
    applyKenneySky(this.scene, dusk ? 0xa8a49e : 0xc5c2bc)
  }

  private buildGround(): void {
    const w = scaleWorld(WORLD_W)
    const h = scaleWorld(WORLD_H)
    const maps = makeWorldGroundMaps()
    const geo = new THREE.PlaneGeometry(w, h, 72, 52)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const ly = pos.getY(i)
      const wx = lx + w / 2
      const wz = -ly + h / 2
      pos.setZ(i, heightAtWorld(wx, wz))
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
      map: maps.color,
      roughnessMap: maps.roughness,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.02,
    })
    this.ground = new THREE.Mesh(geo, mat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.set(w / 2, 0, h / 2)
    this.ground.receiveShadow = true
    this.ground.updateMatrixWorld(true)
    this.scene.add(this.ground)

    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 4, h * 4),
      new THREE.MeshBasicMaterial({ color: 0x1c2a30 }),
    )
    under.rotation.x = -Math.PI / 2
    under.position.set(w / 2, -1.5, h / 2)
    this.scene.add(under)
  }

  private sculptRock(radius: number): THREE.BufferGeometry {
    const geo = new THREE.IcosahedronGeometry(radius, 1)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      v.addScaledVector(v.clone().normalize(), Math.sin(v.x * 6 + v.z * 5) * radius * 0.12)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    return geo
  }

  private buildBlockers(): void {
    const rockMap = kenneyRock()
    const wallMat = new THREE.MeshStandardMaterial({
      map: rockMap,
      color: 0xb8b4ae,
      roughness: 0.94,
      metalness: 0.04,
    })
    const w = scaleWorld(WORLD_W)
    const h = scaleWorld(WORLD_H)
    const edge = (x: number, z: number, sx: number, sz: number, hy: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, hy, sz), wallMat)
      m.position.set(x, elev(x, z, hy * 0.28), z)
      m.castShadow = true
      m.receiveShadow = true
      this.scene.add(m)
    }
    edge(w / 2, 0.7, w + 2, 2.2, 4.2)
    edge(w / 2, h - 0.7, w + 2, 2.2, 4.2)
    edge(0.7, h / 2, 2.2, h + 2, 4.2)
    edge(w - 0.7, h / 2, 2.2, h + 2, 4.2)

    const rockMat = new THREE.MeshStandardMaterial({
      map: rockMap,
      color: 0xaea8a0,
      roughness: 0.88,
      metalness: 0.08,
    })
    const c = cols()
    const crystalSpots = [LANDMARKS.c1, LANDMARKS.c2, LANDMARKS.c3]
    for (const [tx, ty] of ROCK_POCKETS) {
      if (tx >= c) continue
      const gx = tx * TILE + TILE / 2
      const gy = ty * TILE + TILE / 2
      if (crystalSpots.some(([cx, cy]) => Math.hypot(gx - cx, gy - cy) < 160)) continue
      const x = scaleWorld(gx)
      const z = scaleWorld(gy)
      const geo = this.sculptRock(0.95 + ((tx * 13 + ty) % 5) * 0.08)
      const rock = new THREE.Mesh(geo, rockMat)
      const sy = 0.95 + (ty % 3) * 0.18
      rock.scale.set(1.45, sy, 1.3)
      rock.rotation.y = tx * 0.7
      geo.computeBoundingBox()
      const minY = geo.boundingBox?.min.y ?? -0.95
      rock.position.set(x, elev(x, z, -minY * sy - 0.08), z)
      rock.castShadow = true
      rock.receiveShadow = true
      this.scene.add(rock)
    }
  }

  private dressWorld(): void {
    const bark = new THREE.MeshToonMaterial({ map: makeBarkTexture(), color: 0xc4a078 })
    const canopyMap = makeCanopyTexture()
    const canopy = new THREE.MeshToonMaterial({ map: canopyMap, color: 0x7a9a6e })
    const canopy2 = new THREE.MeshToonMaterial({ map: canopyMap, color: 0x5e7a58 })
    const stone = new THREE.MeshStandardMaterial({ map: kenneyStone(), color: 0xd8d4cc, roughness: 0.82, metalness: 0.12 })
    const rockMat = new THREE.MeshStandardMaterial({ map: kenneyRock(), color: 0xaea8a0, roughness: 0.9, metalness: 0.06 })
    const grass = new THREE.MeshToonMaterial({ color: currentAct === 2 ? 0x6a5848 : 0x5a7a58 })
    const copper = new THREE.MeshStandardMaterial({
      color: 0xe8a87c,
      metalness: 0.65,
      roughness: 0.35,
      emissive: 0xe8a87c,
      emissiveIntensity: 0.12,
    })
    const cloth = new THREE.MeshStandardMaterial({
      map: kenneyThatch(),
      color: 0xe8d4b0,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
    const ember = new THREE.MeshStandardMaterial({
      color: 0xff6a32,
      emissive: 0xff4a18,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    })
    const grid = buildCollision()
    const rng = (n: number) => {
      const t = Math.sin(n * 12.9898) * 43758.5453
      return t - Math.floor(t)
    }

    const tree = (x: number, z: number, h = 2.4, seed = 1) => {
      const g = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, h, 8), bark)
      trunk.position.y = h / 2
      trunk.castShadow = true
      g.add(trunk)
      if (currentAct === 2) {
        for (let i = 0; i < 3; i++) {
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.7 + rng(seed + i) * 0.4, 5), bark)
          br.position.set((rng(seed + i * 2) - 0.5) * 0.35, h * (0.45 + i * 0.12), (rng(seed + i * 3) - 0.5) * 0.35)
          br.rotation.z = (rng(seed + i * 4) - 0.5) * 1.1
          br.rotation.x = (rng(seed + i * 5) - 0.5) * 0.8
          br.castShadow = true
          g.add(br)
        }
      } else {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82 + rng(seed) * 0.2, 0), canopy)
        leaves.position.y = h + 0.15
        leaves.scale.set(1.15 + rng(seed + 1) * 0.2, 0.85 + rng(seed + 2) * 0.25, 1.1)
        leaves.castShadow = true
        const leaves2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), canopy2)
        leaves2.position.set(0.35, h - 0.15, -0.1)
        leaves2.castShadow = true
        g.add(leaves, leaves2)
      }
      g.position.set(x, elev(x, z), z)
      this.scene.add(g)
    }

    const pillar = (x: number, z: number, broken = false) => {
      const y0 = elev(x, z)
      const h = broken ? 1.15 : 2.7
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, h, 8), stone)
      col.position.set(x, y0 + (broken ? 0.42 : h / 2), z)
      col.rotation.z = broken ? 1.15 : 0
      col.castShadow = true
      col.receiveShadow = true
      this.scene.add(col)
      if (!broken) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.18, 8), copper)
        cap.position.set(x, y0 + h + 0.08, z)
        this.scene.add(cap)
      }
    }

    const boulder = (x: number, z: number, s = 0.7) => {
      const geo = this.sculptRock(s)
      const rock = new THREE.Mesh(geo, rockMat)
      rock.rotation.y = x + z
      geo.computeBoundingBox()
      const minY = geo.boundingBox?.min.y ?? -s
      rock.position.set(x, elev(x, z, -minY - 0.04), z)
      rock.castShadow = true
      rock.receiveShadow = true
      this.scene.add(rock)
    }

    const tuft = (x: number, z: number, seed = 1) => {
      for (let i = 0; i < 5; i++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28 + rng(seed + i) * 0.18, 5), grass)
        blade.position.set(x + (rng(seed + i * 3) - 0.5) * 0.28, elev(x, z, 0.14), z + (rng(seed + i * 5) - 0.5) * 0.28)
        blade.rotation.z = (rng(seed + i * 7) - 0.5) * 0.45
        blade.rotation.x = (rng(seed + i * 9) - 0.5) * 0.25
        this.scene.add(blade)
      }
    }

    const nearLandmark = (x: number, y: number, r: number) => {
      for (const p of Object.values(LANDMARKS)) {
        if (Math.hypot(x - p[0], y - p[1]) < r) return true
      }
      for (const p of storySpots()) {
        if (Math.hypot(x - p[0], y - p[1]) < r) return true
      }
      return false
    }

    const hidesCrystal = (x: number, y: number) => {
      for (const key of ['c1', 'c2', 'c3', 'gate'] as const) {
        const [cx, cy] = LANDMARKS[key]
        const dx = x - cx
        const dy = y - cy
        if (Math.hypot(dx, dy) < 210) return true
        // Camera looks north; props south of a crystal sit in front of it.
        if (dy > 0 && dy < 280 && Math.abs(dx) < 140) return true
      }
      return false
    }

    for (let i = 0; i < 90; i++) {
      const x = 200 + rng(i * 3.1) * (WORLD_W - 400)
      const y = 200 + rng(i * 7.7) * (WORLD_H - 400)
      if (distToPath(x, y) < 88) continue
      if (nearLandmark(x, y, 180)) continue
      if (hidesCrystal(x, y)) continue
      if (blockedAt(grid, x, y, 18)) continue
      tree(scaleWorld(x), scaleWorld(y), 2.0 + rng(i) * 1.3, i)
    }

    for (let i = 0; i < 70; i++) {
      const x = 180 + rng(i * 11.3) * (WORLD_W - 360)
      const y = 180 + rng(i * 5.9) * (WORLD_H - 360)
      if (distToPath(x, y) < 50) continue
      if (nearLandmark(x, y, 90)) continue
      if (blockedAt(grid, x, y, 12)) continue
      tuft(scaleWorld(x), scaleWorld(y), i + 40)
    }

    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = path[i]
        const [bx, by] = path[i + 1]
        const steps = 5
        for (let s = 1; s < steps; s++) {
          const t = s / steps
          const px = ax + (bx - ax) * t + (rng(ax + s) - 0.5) * 28
          const py = ay + (by - ay) * t + (rng(ay + s) - 0.5) * 28
          if (nearLandmark(px, py, 90)) continue
          if (Math.hypot(px - LANDMARKS.gate[0], py - LANDMARKS.gate[1]) < 110) continue
          boulder(scaleWorld(px), scaleWorld(py), 0.18 + rng(s + ax) * 0.16)
        }
      }
    }

    const campX = LANDMARKS.spawn[0] - 55
    const campY = LANDMARKS.spawn[1] + 40
    const cx = scaleWorld(campX)
    const cz = scaleWorld(campY)
    const cy = elev(cx, cz)
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.16, 10), stone)
    pit.position.set(cx, cy + 0.08, cz)
    this.scene.add(pit)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      boulder(cx + Math.cos(a) * 0.7, cz + Math.sin(a) * 0.7, 0.16)
    }
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12 + i * 0.04, 0.45 + i * 0.1, 6), ember)
      flame.position.set(cx + (i - 1) * 0.08, cy + 0.32 + i * 0.05, cz)
      this.scene.add(flame)
      this.campFlames.push(flame)
    }
    this.campFire = new THREE.PointLight(0xff7a38, 2.6, 16, 2)
    this.campFire.position.set(cx, cy + 1.1, cz)
    this.scene.add(this.campFire)

    const log = (lx: number, lz: number, rot: number) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.35, 8), bark)
      mesh.rotation.z = Math.PI / 2
      mesh.rotation.y = rot
      mesh.position.set(lx, elev(lx, lz, 0.12), lz)
      mesh.castShadow = true
      this.scene.add(mesh)
    }
    log(cx + 1.15, cz + 0.55, 0.4)
    log(cx + 0.95, cz + 0.85, 0.15)
    log(cx - 1.2, cz + 0.2, -0.5)

    const tent = new THREE.Group()
    const base = 0.95
    const ridgeH = 1.38
    const depth = 2.45
    const halfD = depth / 2
    const slope = Math.hypot(base, ridgeH)
    const tilt = Math.atan2(base, ridgeH)
    const wallGeo = new THREE.BoxGeometry(0.08, slope, depth)
    const wallA = new THREE.Mesh(wallGeo, cloth)
    const wallB = new THREE.Mesh(wallGeo, cloth)
    wallA.rotation.z = -tilt
    wallB.rotation.z = tilt
    wallA.position.set(-base / 2, ridgeH / 2, 0)
    wallB.position.set(base / 2, ridgeH / 2, 0)
    wallA.castShadow = true
    wallB.castShadow = true

    const gable = new THREE.Shape()
    gable.moveTo(-base, 0)
    gable.lineTo(base, 0)
    gable.lineTo(0, ridgeH)
    gable.closePath()
    const back = new THREE.Mesh(new THREE.ShapeGeometry(gable), cloth)
    back.position.set(0, 0, -halfD + 0.02)

    const doorW = 0.4
    const doorH = 0.98
    const frontShape = gable.clone()
    const hole = new THREE.Path()
    hole.moveTo(-doorW, 0.02)
    hole.lineTo(-doorW, doorH)
    hole.lineTo(0, doorH + 0.16)
    hole.lineTo(doorW, doorH)
    hole.lineTo(doorW, 0.02)
    hole.closePath()
    frontShape.holes.push(hole)
    const front = new THREE.Mesh(new THREE.ShapeGeometry(frontShape), cloth)
    front.position.set(0, 0, halfD - 0.02)
    front.castShadow = true

    const interior = new THREE.Mesh(
      new THREE.ShapeGeometry(gable),
      new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1, side: THREE.DoubleSide }),
    )
    interior.position.set(0, 0.01, -0.15)

    const flapMat = cloth.clone()
    flapMat.side = THREE.DoubleSide
    const makeFlap = (side: number) => {
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.05), flapMat)
      flap.position.set(side * 0.22, 0.52, halfD - 0.06)
      flap.rotation.y = side * 0.62
      flap.rotation.z = side * -0.06
      flap.castShadow = true
      return flap
    }

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, depth, 6), bark)
    pole.rotation.x = Math.PI / 2
    pole.position.set(0, ridgeH - 0.02, 0)

    tent.add(wallA, wallB, back, front, interior, makeFlap(-1), makeFlap(1), pole)
    tent.position.set(cx - 2.35, elev(cx - 2.35, cz + 1.55), cz + 1.55)
    tent.rotation.y = 0.45
    this.scene.add(tent)

    if (currentAct === 2) {
      const wreck = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 1.15), cloth)
      wreck.rotation.set(0.42, 0.7, 0.18)
      wreck.position.set(cx + 3.1, elev(cx + 3.1, cz + 1.7, 0.18), cz + 1.7)
      wreck.castShadow = true
      this.scene.add(wreck)
      const wreckPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), bark)
      wreckPole.rotation.z = 1.15
      wreckPole.position.set(cx + 3.4, elev(cx + 3.4, cz + 1.35, 0.12), cz + 1.35)
      this.scene.add(wreckPole)
    }

    const sx = scaleWorld(LANDMARKS.sage[0])
    const sz = scaleWorld(LANDMARKS.sage[1])
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      boulder(sx + Math.cos(a) * 2.1, sz + Math.sin(a) * 2.1, 0.38 + (i % 3) * 0.08)
    }

    const g3x = scaleWorld(LANDMARKS.c3[0])
    const g3z = scaleWorld(LANDMARKS.c3[1])
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const oz = Math.sin(a) * 3.15
      if (oz > 0.55) continue
      boulder(g3x + Math.cos(a) * 3.15, g3z + oz, 0.42 + (i % 3) * 0.1)
    }
    log(g3x + 2.4, g3z - 0.8, 0.55)
    log(g3x + 2.1, g3z - 1.15, 0.2)

    pillar(scaleWorld(9 * TILE), scaleWorld(9 * TILE))
    pillar(scaleWorld(22 * TILE), scaleWorld(5 * TILE), true)
    pillar(scaleWorld(15 * TILE), scaleWorld(15 * TILE))
    pillar(scaleWorld(24 * TILE), scaleWorld(16 * TILE), true)
    pillar(scaleWorld(LANDMARKS.c2[0] - 200), scaleWorld(LANDMARKS.c2[1] - 80))
    pillar(scaleWorld(LANDMARKS.c2[0] + 180), scaleWorld(LANDMARKS.c2[1] - 110), true)
    pillar(scaleWorld(LANDMARKS.gate[0]), scaleWorld(LANDMARKS.gate[1] - 35))
    pillar(scaleWorld(LANDMARKS.gate[0]), scaleWorld(LANDMARKS.gate[1] + 75), true)

    const ruinWall = (x: number, z: number, rot: number, len = 2.4) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 1.15, 0.28), stone)
      wall.position.set(x, elev(x, z, 0.55), z)
      wall.rotation.y = rot
      wall.castShadow = true
      wall.receiveShadow = true
      this.scene.add(wall)
    }
    ruinWall(scaleWorld(LANDMARKS.c2[0] - 160), scaleWorld(LANDMARKS.c2[1] - 150), 0.25, 3.2)
    ruinWall(scaleWorld(LANDMARKS.c2[0] + 150), scaleWorld(LANDMARKS.c2[1] - 170), 1.05, 2.6)
    ruinWall(scaleWorld(LANDMARKS.gate[0] - 72), scaleWorld(LANDMARKS.gate[1] - 52), 0.55, 2.4)
    ruinWall(scaleWorld(LANDMARKS.boss[0] - 120), scaleWorld(LANDMARKS.boss[1] - 40), 0.2, 3.6)

    const bx = scaleWorld(LANDMARKS.boss[0])
    const bz = scaleWorld(LANDMARKS.boss[1])
    const hx = scaleWorld(LANDMARKS.heal[0])
    const hz = scaleWorld(LANDMARKS.heal[1])
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      let radius = 7.4
      let px = bx + Math.cos(a) * radius
      let pz = bz + Math.sin(a) * radius
      const dHeal = Math.hypot(px - hx, pz - hz)
      if (dHeal < 4.2) {
        radius -= 4.2 - dHeal + 0.8
        radius = Math.max(3.4, radius)
        px = bx + Math.cos(a) * radius
        pz = bz + Math.sin(a) * radius
      }
      const h = 1.6 + (i % 3) * 0.45
      const y0 = elev(px, pz)
      const menhir = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.38), stone)
      menhir.position.set(px, y0 + h / 2, pz)
      menhir.rotation.y = a + 0.4
      menhir.castShadow = true
      menhir.receiveShadow = true
      this.scene.add(menhir)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.44), copper)
      cap.position.set(px, y0 + h + 0.04, pz)
      cap.rotation.y = a + 0.4
      this.scene.add(cap)
    }
  }

  resize(): void {
    const parent = this.canvas.parentElement
    const w = parent?.clientWidth || window.innerWidth
    const h = Math.max(420, parent?.clientHeight || window.innerHeight * 0.72)
    this.renderer.setSize(w, h, false)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Convert screen coords to game-world XZ on the ground plane */
  screenToGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshHit = this.raycaster.intersectObject(this.ground, false)[0]
    if (meshHit) return { x: meshHit.point.x / 0.04, y: meshHit.point.z / 0.04 }
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmp)
    if (!hit) return null
    return { x: hit.x / 0.04, y: hit.z / 0.04 }
  }

  ensureEnemy(key: string, kind: ActorKind): Actor3D {
    let a = this.enemies.get(key)
    if (!a) {
      a = new Actor3D(kind)
      this.enemies.set(key, a)
      this.scene.add(a.root)
      const bar = new EnemyHpBar()
      this.scene.add(bar.root)
      this.hpBars.set(key, bar)
    }
    return a
  }

  private syncProps(props: WorldProp[]): void {
    for (const p of props) {
      const id = `${p.kind}-${p.id ?? `${p.x}-${p.y}`}`
      if (p.kind === 'spawn') continue
      if (p.kind === 'crystal' && p.taken) {
        const existing = this.propMeshes.get(id)
        if (existing) {
          this.scene.remove(existing)
          this.propMeshes.delete(id)
        }
        continue
      }
      if (this.propMeshes.has(id)) {
        const obj = this.propMeshes.get(id)!
        if (p.kind === 'crystal') {
          obj.rotation.y += 0.02
          const bob = Math.sin(performance.now() / 280 + p.x) * 0.1
          for (const child of obj.children) {
            if ((child as THREE.Mesh).isMesh && child.position.y > 0.8 && child.position.y < 2) {
              child.position.y = 1.15 + bob
            }
          }
        }
        continue
      }

      let obj: THREE.Object3D
      if (p.kind === 'site') {
        const built = this.buildSite(p.id ?? '')
        if (!built) continue
        obj = built
      } else if (p.kind === 'crystal') {
        const g = new THREE.Group()
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.5, 0),
          new THREE.MeshStandardMaterial({
            color: 0x7ad4e0,
            emissive: 0x5eb1bf,
            emissiveIntensity: 1.15,
            metalness: 0.35,
            roughness: 0.16,
          }),
        )
        crystal.position.y = 1.15
        crystal.castShadow = true
        const inner = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.26, 0),
          new THREE.MeshStandardMaterial({
            color: 0xe8f6f8,
            emissive: 0xffffff,
            emissiveIntensity: 0.55,
            transparent: true,
            opacity: 0.9,
          }),
        )
        inner.position.y = 1.15
        const plinth = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.42, 0.24, 6),
          new THREE.MeshStandardMaterial({ map: kenneyStone(), color: 0xc8c4bc, roughness: 0.8, metalness: 0.15 }),
        )
        plinth.position.y = 0.12
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.78, 20),
          new THREE.MeshBasicMaterial({
            color: 0x8fe0ea,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.04
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.28, 5.2, 10, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x9ae8f0,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        )
        beam.position.y = 3.2
        g.add(plinth, ring, crystal, inner, beam)
        const light = new THREE.PointLight(0x7ad4e0, 2.4, 18)
        light.position.y = 1.4
        g.add(light)
        obj = g
      } else if (p.kind === 'heal') {
        const g = new THREE.Group()
        const stone = new THREE.MeshStandardMaterial({
          map: kenneyStone(),
          color: 0xd4d0c8,
          roughness: 0.88,
          metalness: 0.08,
          side: THREE.DoubleSide,
        })
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.52, 0.42, 20, 1, true), stone)
        wall.position.y = 0.21
        wall.castShadow = true
        wall.receiveShadow = true
        const water = new THREE.Mesh(
          new THREE.CircleGeometry(1.28, 28),
          new THREE.MeshStandardMaterial({
            map: kenneyWater(),
            color: 0x7ec8d4,
            emissive: 0x4aa8b4,
            emissiveIntensity: 0.35,
            roughness: 0.18,
            metalness: 0.18,
          }),
        )
        water.name = 'healWater'
        water.rotation.x = -Math.PI / 2
        water.position.y = 0.26
        const lip = new THREE.Mesh(
          new THREE.TorusGeometry(1.42, 0.08, 8, 24),
          new THREE.MeshStandardMaterial({ map: kenneyStone(), color: 0xeeeee8, roughness: 0.7, metalness: 0.12 }),
        )
        lip.rotation.x = Math.PI / 2
        lip.position.y = 0.42
        g.add(wall, water, lip)
        obj = g
      } else if (p.kind === 'sage') {
        const sage = new Actor3D('sage')
        obj = sage.root
        ;(obj as THREE.Object3D & { __actor?: Actor3D }).__actor = sage
      } else {
        continue
      }

      obj.position.set(scaleWorld(p.x), elev(scaleWorld(p.x), scaleWorld(p.y)), scaleWorld(p.y))
      this.propMeshes.set(id, obj)
      this.scene.add(obj)
    }
  }

  private buildSite(id: string): THREE.Object3D | null {
    const g = new THREE.Group()
    const stone = new THREE.MeshStandardMaterial({
      map: kenneyStone(),
      color: 0xc8c4bc,
      roughness: 0.82,
      metalness: 0.12,
    })
    const bark = new THREE.MeshStandardMaterial({
      map: kenneyThatch(),
      color: 0x8a6a48,
      roughness: 0.9,
      metalness: 0.04,
    })
    if (id === 'cairn') {
      const sizes = [0.42, 0.32, 0.22]
      let y = 0.18
      for (const s of sizes) {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), stone)
        rock.position.y = y
        rock.rotation.set(0.2, y * 3, 0.15)
        rock.castShadow = true
        g.add(rock)
        y += s * 0.85
      }
      return g
    }
    if (id === 'cart') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 0.72), bark)
      bed.rotation.set(0.35, 0.4, 0.55)
      bed.position.set(0.1, 0.38, 0)
      bed.castShadow = true
      const wheel = (x: number, z: number) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10), stone)
        w.rotation.z = Math.PI / 2
        w.position.set(x, 0.22, z)
        w.castShadow = true
        g.add(w)
      }
      wheel(-0.45, 0.28)
      wheel(0.55, -0.12)
      g.add(bed)
      return g
    }
    if (id === 'ridge') {
      const menhir = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.85, 0.28), stone)
      menhir.position.y = 0.92
      menhir.rotation.y = 0.35
      menhir.castShadow = true
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.1, 0.34),
        new THREE.MeshStandardMaterial({ color: 0xe8a87c, metalness: 0.55, roughness: 0.4 }),
      )
      cap.position.y = 1.88
      cap.rotation.y = 0.35
      g.add(menhir, cap)
      return g
    }
    if (id === 'stele') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.45, 0.12), stone)
      slab.position.y = 0.72
      slab.castShadow = true
      g.add(slab)
      return g
    }
    return null
  }

  private makeSlashTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 128
    const ctx = c.getContext('2d')!
    const fade = ctx.createLinearGradient(0, 0, 256, 0)
    fade.addColorStop(0, 'rgba(255,255,255,0)')
    fade.addColorStop(0.18, 'rgba(255,255,255,0.75)')
    fade.addColorStop(0.5, 'rgba(255,255,255,1)')
    fade.addColorStop(0.82, 'rgba(255,255,255,0.7)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.strokeStyle = fade
    ctx.lineCap = 'round'
    ctx.lineWidth = 22
    ctx.beginPath()
    ctx.moveTo(18, 108)
    ctx.quadraticCurveTo(128, 8, 238, 96)
    ctx.stroke()
    ctx.lineWidth = 8
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.moveTo(18, 108)
    ctx.quadraticCurveTo(128, 8, 238, 96)
    ctx.stroke()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }

  spawnSlash(x: number, y: number, angle: number, color: number): void {
    this.fx.spawnSlash(x, y, angle, color)
  }

  spawnLunge(x: number, y: number, angle: number, length: number): void {
    this.fx.spawnLunge(x, y, angle, length)
  }

  spawnPop(x: number, y: number, amount: number, color: number): void {
    this.fx.spawnPop(x, y, amount, color)
  }

  spawnImpact(x: number, y: number, radius: number, color: number): void {
    this.fx.spawnImpact(x, y, radius, color)
  }

  spawnSlam(x: number, y: number, radius: number): void {
    this.fx.spawnSlam(x, y, radius)
  }

  spawnCast(x: number, y: number, heavy: boolean): void {
    this.fx.spawnCast(x, y, heavy)
  }

  sync(s: ViewSync): void {
    const dt = Math.min(0.033, this.clock.getDelta())

    // player
    const px = scaleWorld(s.player.x)
    const pz = scaleWorld(s.player.y)
    const py = elev(px, pz)
    this.player.setWorld(px, pz, s.player.facing, py)
    if (s.player.dodging) this.player.setAnim('dodge', true)
    else if (s.player.slamming || s.player.casting) {
      this.player.setAnim('attack')
      this.player.holdWind()
      this.player.update(0, false)
    } else if (s.player.attacking || s.player.lunging) this.player.setAnim('attack')
    else this.player.setAnim(s.player.moving ? 'walk' : 'idle')
    if (!s.player.slamming && !s.player.casting) this.player.update(dt, s.player.moving)
    if (s.player.hitFlash) this.player.pulseHit()

    // enemies
    const live = new Set<string>()
    for (const e of s.enemies) {
      live.add(e.key)
      const a = this.ensureEnemy(e.key, e.id)
      if (!e.alive && e.dying <= 0) {
        a.root.visible = false
        const deadBar = this.hpBars.get(e.key)
        if (deadBar) deadBar.root.visible = false
        continue
      }
      a.root.visible = true
      const sink = e.alive ? 0 : (1 - e.dying) * 0.85
      a.setWorld(scaleWorld(e.x), scaleWorld(e.y), e.facing, elev(scaleWorld(e.x), scaleWorld(e.y)) - sink)
      if (!e.alive) {
        a.root.scale.setScalar(0.55 + e.dying * 0.45)
        a.setAnim('idle')
        a.update(dt, false)
        const deadBar = this.hpBars.get(e.key)
        if (deadBar) deadBar.root.visible = false
        continue
      }
      if (e.windup) {
        a.setAnim('attack')
        a.holdWind()
        a.update(0, false)
      } else if (e.attacking) a.setAnim('attack')
      else a.setAnim(e.moving ? 'walk' : 'idle')
      if (!e.windup) a.update(dt, e.moving)
      if (e.hitFlash) a.pulseHit()
      if (e.dormant) a.root.scale.setScalar(0.95)
      else if (e.recovering) a.root.scale.setScalar(e.raged ? 1.02 : 0.96)
      else a.root.scale.setScalar(e.raged ? 1.08 : 1)
      const bar = this.hpBars.get(e.key)
      if (bar) {
        const near = Math.hypot(e.x - s.player.x, e.y - s.player.y) < 380
        const show = !e.dormant && (e.hp < e.maxHp || e.hitFlash || e.attacking || e.recovering || near)
        bar.root.position.copy(a.root.position)
        bar.set(e.hp, e.maxHp, BAR_H[e.id] ?? 3.15, show, dt)
        bar.face(this.camera)
        bar.root.visible = bar.root.visible && e.alive
      }
    }
    for (const [key, a] of this.enemies) {
      if (!live.has(key)) {
        this.scene.remove(a.root)
        a.dispose()
        this.enemies.delete(key)
        const bar = this.hpBars.get(key)
        if (bar) {
          this.scene.remove(bar.root)
          bar.dispose()
          this.hpBars.delete(key)
        }
      }
    }

    this.syncProps(s.props)
    for (const [id, obj] of this.propMeshes) {
      if (!id.startsWith('heal-')) continue
      const water = obj.getObjectByName('healWater') as THREE.Mesh | undefined
      if (!water) continue
      const mat = water.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = s.healChannel ? 0.95 + Math.sin(performance.now() / 80) * 0.25 : 0.35
    }
    for (const [, obj] of this.propMeshes) {
      const actor = (obj as THREE.Object3D & { __actor?: Actor3D }).__actor
      actor?.update(dt, false)
    }

    // marker
    if (s.moveMarker && s.moveMarker.life > 0) {
      this.marker.visible = true
      this.marker.position.set(scaleWorld(s.moveMarker.x), elev(scaleWorld(s.moveMarker.x), scaleWorld(s.moveMarker.y), 0.05), scaleWorld(s.moveMarker.y))
      ;(this.marker.material as THREE.MeshBasicMaterial).opacity = 0.3 + s.moveMarker.life
      this.marker.scale.setScalar(1 + (1 - Math.min(1, s.moveMarker.life / 0.55)) * 0.4)
    } else {
      this.marker.visible = false
    }

    this.fx.setTelegraphs(s.telegraphs)
    this.fx.setBolts(s.bolts)
    this.fx.update(dt)

    // Diablo-style chase camera
    const shake = s.shake * 0.35
    this.follow.lerp(new THREE.Vector3(px, py, pz), 1 - Math.exp(-dt * 5))
    this.camera.position.set(
      this.follow.x + (Math.random() - 0.5) * shake,
      14.5 + this.follow.y * 0.35,
      this.follow.z + 12.5 + (Math.random() - 0.5) * shake,
    )
    this.camera.lookAt(this.follow.x, 1.35 + this.follow.y, this.follow.z)

    const heroLight = this.scene.getObjectByName('heroLight') as THREE.PointLight | undefined
    if (heroLight) heroLight.position.set(this.follow.x, 4.5 + this.follow.y, this.follow.z)

    if (this.campFire) {
      const flicker = 2.2 + Math.sin(performance.now() / 90) * 0.45 + Math.sin(performance.now() / 37) * 0.2
      this.campFire.intensity = flicker
      for (let i = 0; i < this.campFlames.length; i++) {
        const f = this.campFlames[i]
        f.scale.y = 0.85 + Math.sin(performance.now() / 70 + i) * 0.18
      }
    }

    // painted actors always face camera (never edge-on)
    this.player.faceCamera(this.camera)
    for (const e of s.enemies) {
      if (!e.alive && e.dying <= 0) continue
      this.enemies.get(e.key)?.faceCamera(this.camera)
    }
  }

  snapCamera(gx: number, gy: number): void {
    const px = scaleWorld(gx)
    const pz = scaleWorld(gy)
    const py = elev(px, pz)
    this.follow.set(px, py, pz)
    this.camera.position.set(this.follow.x, 14.5 + this.follow.y * 0.35, this.follow.z + 12.5)
    this.camera.lookAt(this.follow.x, 1.35 + this.follow.y, this.follow.z)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.player.dispose()
    for (const a of this.enemies.values()) a.dispose()
    for (const bar of this.hpBars.values()) {
      this.scene.remove(bar.root)
      bar.dispose()
    }
    this.hpBars.clear()
    this.fx.dispose()
    this.renderer.dispose()
  }
}
