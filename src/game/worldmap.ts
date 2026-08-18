import * as THREE from 'three'
import { LANDMARKS, PATHS, ROCK_POCKETS, TILE, WORLD_H, WORLD_W, currentAct } from '../data/world'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function toTex(c: HTMLCanvasElement, opts?: { repeat?: number; srgb?: boolean; wrap?: boolean }): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = opts?.wrap === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  t.repeat.set(opts?.repeat ?? 1, opts?.repeat ?? 1)
  t.anisotropy = 8
  t.colorSpace = opts?.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function speckle(ctx: CanvasRenderingContext2D, n: number, rng: () => number, paint: (x: number, y: number, r: number) => void): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  for (let i = 0; i < n; i++) paint(rng() * w, rng() * h, 0.6 + rng() * 4)
}

/** Whole-world painted color + roughness. One map, not a tiled photo. */
export function makeWorldGroundMaps(): {
  color: THREE.CanvasTexture
  roughness: THREE.CanvasTexture
} {
  const w = 1400
  const h = 1000
  const colorC = canvas(w, h)
  const roughC = canvas(w, h)
  const ctx = colorC.getContext('2d')!
  const rx = roughC.getContext('2d')!
  const rng = mulberry32(0x51e11)

  const gx = (x: number) => (x / WORLD_W) * w
  const gy = (y: number) => (y / WORLD_H) * h

  ctx.fillStyle = currentAct === 2 ? '#4a524c' : '#5a6b58'
  ctx.fillRect(0, 0, w, h)
  rx.fillStyle = '#c8c8c8'
  rx.fillRect(0, 0, w, h)

  const wash = (cx: number, cy: number, r: number, fill: string) => {
    const g = ctx.createRadialGradient(gx(cx), gy(cy), 8, gx(cx), gy(cy), r)
    g.addColorStop(0, fill)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  wash(LANDMARKS.spawn[0], LANDMARKS.spawn[1], 420, currentAct === 2 ? 'rgba(92, 78, 64, 0.58)' : 'rgba(138, 112, 72, 0.55)')
  wash(LANDMARKS.sage[0], LANDMARKS.sage[1], 260, 'rgba(92, 108, 88, 0.4)')
  wash(LANDMARKS.c1[0], LANDMARKS.c1[1], 380, currentAct === 2 ? 'rgba(48, 62, 58, 0.62)' : 'rgba(58, 92, 64, 0.62)')
  wash(LANDMARKS.c2[0], LANDMARKS.c2[1], 360, 'rgba(92, 98, 104, 0.58)')
  wash(LANDMARKS.gate[0], LANDMARKS.gate[1], 220, 'rgba(88, 78, 64, 0.5)')
  wash(LANDMARKS.c3[0], LANDMARKS.c3[1], 340, 'rgba(48, 78, 76, 0.55)')
  wash(LANDMARKS.heal[0], LANDMARKS.heal[1], 220, 'rgba(64, 130, 138, 0.5)')
  wash(LANDMARKS.boss[0], LANDMARKS.boss[1], 320, currentAct === 2 ? 'rgba(58, 48, 52, 0.78)' : 'rgba(72, 78, 82, 0.7)')

  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = `rgba(${55 + rng() * 40},${90 + rng() * 50},${58 + rng() * 30},${0.08 + rng() * 0.14})`
    ctx.beginPath()
    ctx.ellipse(rng() * w, rng() * h, 40 + rng() * 110, 22 + rng() * 60, rng() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  speckle(ctx, 9000, rng, (x, y, r) => {
    const shade = 70 + rng() * 70
    ctx.fillStyle = `rgba(${shade * 0.82},${shade},${shade * 0.72},${0.06 + rng() * 0.16})`
    ctx.beginPath()
    ctx.arc(x, y, r * (0.8 + rng() * 2.2), 0, Math.PI * 2)
    ctx.fill()
  })

  const drawPath = (width: number, style: string, dash?: number[]) => {
    ctx.strokeStyle = style
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = width
    ctx.setLineDash(dash ?? [])
    for (const path of PATHS) {
      ctx.beginPath()
      ctx.moveTo(gx(path[0][0]), gy(path[0][1]))
      for (let i = 1; i < path.length; i++) ctx.lineTo(gx(path[i][0]), gy(path[i][1]))
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  drawPath(46, 'rgba(92, 74, 48, 0.62)')
  drawPath(32, 'rgba(148, 118, 78, 0.5)')
  drawPath(14, 'rgba(176, 148, 102, 0.38)')
  drawPath(3, 'rgba(58, 46, 30, 0.35)', [10, 18])

  rx.strokeStyle = '#9a9a9a'
  rx.lineCap = 'round'
  rx.lineJoin = 'round'
  rx.lineWidth = 36
  for (const path of PATHS) {
    rx.beginPath()
    rx.moveTo(gx(path[0][0]), gy(path[0][1]))
    for (let i = 1; i < path.length; i++) rx.lineTo(gx(path[i][0]), gy(path[i][1]))
    rx.stroke()
  }

  for (const [tx, ty] of ROCK_POCKETS) {
    const x = gx(tx * TILE + TILE / 2)
    const y = gy(ty * TILE + TILE / 2)
    ctx.fillStyle = 'rgba(52, 48, 42, 0.78)'
    ctx.beginPath()
    ctx.ellipse(x, y, 22 + (tx % 5) * 3, 16 + (ty % 4) * 3, (tx * 0.4) % 1.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(38, 36, 32, 0.45)'
    ctx.beginPath()
    ctx.ellipse(x + 6, y - 4, 10, 8, 0.3, 0, Math.PI * 2)
    ctx.fill()
    rx.fillStyle = '#8a8a8a'
    rx.beginPath()
    rx.ellipse(x, y, 18, 14, 0.2, 0, Math.PI * 2)
    rx.fill()
  }

  ctx.strokeStyle = 'rgba(18, 22, 24, 0.55)'
  ctx.lineWidth = 28
  ctx.strokeRect(10, 10, w - 20, h - 20)

  speckle(ctx, 6000, rng, (x, y, r) => {
    ctx.fillStyle = `rgba(20, 24, 22, ${0.04 + rng() * 0.08})`
    ctx.fillRect(x, y, r, r)
  })

  const color = toTex(colorC, { wrap: false })
  const roughness = toTex(roughC, { wrap: false, srgb: false })
  return { color, roughness }
}

export function makeRockTexture(): THREE.CanvasTexture {
  const s = 256
  const c = canvas(s)
  const ctx = c.getContext('2d')!
  const rng = mulberry32(0x70c4)
  ctx.fillStyle = '#3a444c'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 180; i++) {
    const x = rng() * s
    const y = rng() * s
    ctx.fillStyle = `rgba(${40 + rng() * 40},${48 + rng() * 40},${52 + rng() * 36},${0.18 + rng() * 0.35})`
    ctx.beginPath()
    ctx.ellipse(x, y, 6 + rng() * 28, 4 + rng() * 16, rng() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(94, 177, 191, ${0.08 + rng() * 0.12})`
    ctx.lineWidth = 1 + rng() * 2
    ctx.beginPath()
    ctx.moveTo(rng() * s, rng() * s)
    ctx.lineTo(rng() * s, rng() * s)
    ctx.stroke()
  }
  return toTex(c, { repeat: 2 })
}

export function makeBarkTexture(): THREE.CanvasTexture {
  const s = 256
  const c = canvas(s)
  const ctx = c.getContext('2d')!
  const rng = mulberry32(0xb4a4)
  ctx.fillStyle = '#3a2a22'
  ctx.fillRect(0, 0, s, s)
  for (let x = 0; x < s; x += 3) {
    ctx.strokeStyle = `rgba(${28 + rng() * 40},${18 + rng() * 22},${12 + rng() * 16},${0.35 + rng() * 0.45})`
    ctx.lineWidth = 1 + rng() * 2.2
    ctx.beginPath()
    ctx.moveTo(x + rng() * 2, 0)
    let y = 0
    while (y < s) {
      y += 8 + rng() * 18
      ctx.lineTo(x + Math.sin(y * 0.08 + x) * 3, y)
    }
    ctx.stroke()
  }
  return toTex(c, { repeat: 1 })
}

export function makeStoneTexture(): THREE.CanvasTexture {
  const s = 256
  const c = canvas(s)
  const ctx = c.getContext('2d')!
  const rng = mulberry32(0x57ce)
  ctx.fillStyle = '#4e585e'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${70 + rng() * 50},${76 + rng() * 48},${80 + rng() * 40},${0.12 + rng() * 0.28})`
    const x = rng() * s
    const y = rng() * s
    ctx.fillRect(x, y, 18 + rng() * 50, 10 + rng() * 28)
  }
  for (let i = 0; i < 25; i++) {
    ctx.strokeStyle = 'rgba(20, 24, 26, 0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(rng() * s, rng() * s, 20 + rng() * 70, 14 + rng() * 40)
  }
  return toTex(c, { repeat: 1 })
}

export function makeCanopyTexture(): THREE.CanvasTexture {
  const s = 256
  const c = canvas(s)
  const ctx = c.getContext('2d')!
  const rng = mulberry32(0x1eaf)
  ctx.fillStyle = '#2f4a38'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(${40 + rng() * 50},${80 + rng() * 70},${48 + rng() * 40},${0.2 + rng() * 0.45})`
    ctx.beginPath()
    ctx.arc(rng() * s, rng() * s, 6 + rng() * 18, 0, Math.PI * 2)
    ctx.fill()
  }
  return toTex(c, { repeat: 1 })
}

export function makeCanvasClothTexture(): THREE.CanvasTexture {
  const s = 256
  const c = canvas(s)
  const ctx = c.getContext('2d')!
  const rng = mulberry32(0xc10f)
  ctx.fillStyle = '#c4a57a'
  ctx.fillRect(0, 0, s, s)
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(${150 + rng() * 50},${120 + rng() * 40},${70 + rng() * 30},${0.08 + rng() * 0.18})`
    ctx.fillRect(rng() * s, rng() * s, 20 + rng() * 80, 8 + rng() * 24)
  }
  ctx.strokeStyle = 'rgba(70, 48, 28, 0.28)'
  ctx.lineWidth = 1
  for (let y = 12; y < s; y += 28) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(s, y + 2)
    ctx.stroke()
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(40, 28, 16, ${0.04 + rng() * 0.08})`
    ctx.fillRect(rng() * s, rng() * s, 3, 18)
  }
  return toTex(c, { repeat: 1 })
}

export function makeSkyTexture(): THREE.CanvasTexture {
  const c = canvas(8, 32)
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 32)
  g.addColorStop(0, '#6a8ea0')
  g.addColorStop(0.45, '#4a6574')
  g.addColorStop(0.78, '#2c3e48')
  g.addColorStop(1, '#1c2a30')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, 32)
  const t = toTex(c, { wrap: false })
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}
