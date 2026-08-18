import { publicUrl } from '../publicUrl'

/** Production-style sprite pipeline: keyed frames + animation + draw polish */

export type AnimName = 'idle' | 'walk' | 'attack' | 'dodge'

export interface AnimClip {
  frames: HTMLCanvasElement[]
  fps: number
  loop: boolean
}

export interface SpriteSet {
  idle: AnimClip
  walk: AnimClip
  attack: AnimClip
  dodge: AnimClip
  ready: boolean
}

export class AnimController {
  set: SpriteSet
  name: AnimName = 'idle'
  time = 0
  locked = false

  constructor(set: SpriteSet) {
    this.set = set
  }

  play(name: AnimName, opts?: { force?: boolean; lock?: boolean }): void {
    if (this.locked && !opts?.force) return
    if (this.name === name && !opts?.force) return
    this.name = name
    this.time = 0
    this.locked = !!opts?.lock
  }

  update(dt: number): void {
    const clip = this.set[this.name]
    if (!clip.frames.length) return
    this.time += dt
    if (!clip.loop) {
      const endT = (clip.frames.length - 0.01) / Math.max(0.01, clip.fps)
      if (this.time >= endT) {
        this.locked = false
        this.name = 'idle'
        this.time = 0
      }
    }
  }

  frameIndex(): number {
    const clip = this.set[this.name]
    if (!clip.frames.length) return 0
    const i = Math.floor(this.time * clip.fps)
    if (clip.loop) return i % clip.frames.length
    return Math.min(clip.frames.length - 1, i)
  }

  frame(): HTMLCanvasElement {
    const clip = this.set[this.name]
    if (!clip.frames.length) return placeholder()
    return clip.frames[this.frameIndex()]
  }
}

function placeholder(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#5eb1bf'
  ctx.beginPath()
  ctx.arc(32, 32, 18, 0, Math.PI * 2)
  ctx.fill()
  return c
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed ${src}`))
    img.src = publicUrl(src)
  })
}

/** Chroma-key green + gray studio floors common in gens */
function keyAndTrim(img: HTMLImageElement): HTMLCanvasElement {
  const src = document.createElement('canvas')
  src.width = img.naturalWidth
  src.height = img.naturalHeight
  const sctx = src.getContext('2d')!
  sctx.drawImage(img, 0, 0)
  const data = sctx.getImageData(0, 0, src.width, src.height)
  const d = data.data

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    // chroma green
    const greenScreen = g > 90 && g > r * 1.35 && g > b * 1.35
    // flat gray backdrop / floor
    const gray = Math.abs(r - g) < 16 && Math.abs(g - b) < 16 && r > 24 && r < 95
    // near white paper
    const paper = r > 210 && g > 210 && b > 210
    if (greenScreen || gray || paper) d[i + 3] = 0
    else if (greenScreen === false && g > 140 && r < 100 && b < 100) {
      // fringe soften
      d[i + 3] = Math.min(d[i + 3], 90)
    }
  }
  sctx.putImageData(data, 0, 0)

  // trim alpha
  let minX = src.width
  let minY = src.height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (d[(y * src.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return src

  const pad = 8
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(src.width - 1, maxX + pad)
  maxY = Math.min(src.height - 1, maxY + pad)
  const tw = maxX - minX + 1
  const th = maxY - minY + 1
  const side = Math.max(tw, th)
  const out = document.createElement('canvas')
  out.width = side
  out.height = side
  const octx = out.getContext('2d')!
  octx.drawImage(src, minX, minY, tw, th, (side - tw) / 2, (side - th) / 2, tw, th)
  return out
}

function scaleFrame(frame: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(frame.width * factor))
  c.height = Math.max(1, Math.round(frame.height * factor))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(frame, 0, 0, c.width, c.height)
  return c
}

async function loadFrames(paths: string[]): Promise<HTMLCanvasElement[]> {
  const frames: HTMLCanvasElement[] = []
  for (const path of paths) {
    try {
      const img = await loadImage(path)
      frames.push(keyAndTrim(img))
    } catch {
      // skip missing
    }
  }
  return frames
}

type FrameDef = {
  idle: string[]
  walk: string[]
  attack: string[]
}

const FRAMES: Record<string, FrameDef> = {
  warden: {
    idle: ['/assets/anim-warden-idle.png', '/assets/sprite-warden.png'],
    walk: [
      '/assets/anim-warden-walk1.png',
      '/assets/anim-warden-walk2.png',
      '/assets/anim-warden-walk3.png',
      '/assets/anim-warden-walk2.png',
    ],
    attack: ['/assets/anim-warden-attack.png', '/assets/anim-warden-idle.png'],
  },
  mystic: {
    idle: ['/assets/anim-mystic-idle.png', '/assets/sprite-mystic.png'],
    walk: [
      '/assets/anim-mystic-walk1.png',
      '/assets/anim-mystic-walk2.png',
      '/assets/anim-mystic-idle.png',
      '/assets/anim-mystic-walk1.png',
    ],
    attack: ['/assets/anim-mystic-attack.png', '/assets/anim-mystic-idle.png'],
  },
  scout: {
    idle: ['/assets/anim-scout-idle.png', '/assets/sprite-scout.png'],
    walk: [
      '/assets/anim-scout-walk1.png',
      '/assets/anim-scout-walk2.png',
      '/assets/anim-scout-idle.png',
      '/assets/anim-scout-walk1.png',
    ],
    attack: ['/assets/anim-scout-attack.png', '/assets/anim-scout-idle.png'],
  },
  beetle: {
    idle: ['/assets/anim-beetle-idle.png', '/assets/sprite-beetle.png'],
    walk: ['/assets/anim-beetle-walk1.png', '/assets/anim-beetle-idle.png', '/assets/anim-beetle-walk1.png'],
    attack: ['/assets/anim-beetle-walk1.png', '/assets/anim-beetle-idle.png'],
  },
  wraith: {
    idle: ['/assets/anim-wraith-idle.png', '/assets/sprite-wraith.png'],
    walk: ['/assets/anim-wraith-walk1.png', '/assets/anim-wraith-idle.png', '/assets/anim-wraith-walk1.png'],
    attack: ['/assets/anim-wraith-walk1.png', '/assets/anim-wraith-idle.png'],
  },
  golem: {
    idle: ['/assets/anim-golem-idle.png', '/assets/sprite-golem.png'],
    walk: ['/assets/anim-golem-walk1.png', '/assets/anim-golem-idle.png', '/assets/anim-golem-walk1.png'],
    attack: ['/assets/anim-golem-walk1.png', '/assets/anim-golem-idle.png'],
  },
  sage: {
    idle: ['/assets/sheet-sage-idle.png', '/assets/npc-sage.png'],
    walk: ['/assets/sheet-sage-idle.png'],
    attack: ['/assets/sheet-sage-idle.png'],
  },
}

function emptySet(): SpriteSet {
  const ph = placeholder()
  return {
    idle: { frames: [ph], fps: 2, loop: true },
    walk: { frames: [ph], fps: 8, loop: true },
    attack: { frames: [ph], fps: 10, loop: false },
    dodge: { frames: [ph], fps: 12, loop: false },
    ready: false,
  }
}

const cache = new Map<string, SpriteSet>()
const loading = new Map<string, Promise<SpriteSet>>()

export function getSpriteSet(id: string): SpriteSet {
  const hit = cache.get(id)
  if (hit) return hit
  const set = emptySet()
  cache.set(id, set)
  void ensureSpriteSet(id)
  return set
}

export async function ensureSpriteSet(id: string): Promise<SpriteSet> {
  const existing = cache.get(id)
  if (existing?.ready) return existing
  const inflight = loading.get(id)
  if (inflight) return inflight

  const job = (async () => {
    const set = cache.get(id) ?? emptySet()
    cache.set(id, set)
    const def = FRAMES[id] ?? FRAMES.warden

    try {
      const idle = await loadFrames(def.idle)
      const walk = await loadFrames(def.walk)
      const attack = await loadFrames(def.attack)

      const idleFrames = idle.length ? idle.slice(0, 1) : walk.slice(0, 1)
      const walkFrames = walk.length ? walk : idleFrames
      const attackFrames = attack.length ? attack : [walkFrames[0], idleFrames[0]].filter(Boolean)

      // subtle idle breathing: duplicate idle with tiny scale pulse frame
      const idleBreathe =
        idleFrames[0] != null
          ? [idleFrames[0], scaleFrame(idleFrames[0], 1.015)]
          : idleFrames

      const dodgeFrames = idleFrames.map((f) => scaleFrame(f, 1.1))

      set.idle = { frames: idleBreathe, fps: 2.5, loop: true }
      set.walk = { frames: walkFrames, fps: 8, loop: true }
      set.attack = { frames: attackFrames, fps: 10, loop: false }
      set.dodge = { frames: dodgeFrames.length ? dodgeFrames : idleFrames, fps: 14, loop: false }
      set.ready = true
    } catch (e) {
      console.warn('sprite load', id, e)
      set.ready = false
    }
    return set
  })()

  loading.set(id, job)
  return job
}

export async function preloadAllSprites(): Promise<void> {
  await Promise.all(Object.keys(FRAMES).map((id) => ensureSpriteSet(id)))
}

const outlineCache = new WeakMap<HTMLCanvasElement, Map<number, HTMLCanvasElement>>()

function outlinedLayer(frame: HTMLCanvasElement, displaySize: number): HTMLCanvasElement {
  let bySize = outlineCache.get(frame)
  if (!bySize) {
    bySize = new Map()
    outlineCache.set(frame, bySize)
  }
  const hit = bySize.get(displaySize)
  if (hit) return hit

  const pad = 6
  const layer = document.createElement('canvas')
  layer.width = displaySize + pad * 2
  layer.height = displaySize + pad * 2
  const lctx = layer.getContext('2d')!
  lctx.imageSmoothingEnabled = true
  lctx.imageSmoothingQuality = 'high'
  const lx = pad
  const ly = pad
  for (const [ox, oy] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-2, -2],
    [2, 2],
    [-2, 2],
    [2, -2],
  ]) {
    lctx.drawImage(frame, lx + ox, ly + oy, displaySize, displaySize)
  }
  lctx.globalCompositeOperation = 'source-in'
  lctx.fillStyle = '#0b1116'
  lctx.fillRect(0, 0, layer.width, layer.height)
  lctx.globalCompositeOperation = 'source-over'
  lctx.drawImage(frame, lx, ly, displaySize, displaySize)
  bySize.set(displaySize, layer)
  return layer
}

/** Commercial ARPG-style blit: soft shadow + rim light + sprite */
export function drawAnimatedSprite(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  x: number,
  y: number,
  displaySize: number,
  facing: number,
  flash: boolean,
  rim?: string,
): void {
  const bob = Math.sin(performance.now() / 220 + x * 0.01) * (flash ? 0 : 1.15)
  const pad = 6
  const layer = outlinedLayer(frame, displaySize)

  ctx.fillStyle = 'rgba(0,0,0,0.48)'
  ctx.beginPath()
  ctx.ellipse(x + 2, y + displaySize * 0.34, displaySize * 0.3, displaySize * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(x, y + bob)
  // Art faces toward bottom of frame (+Y). Align that with movement facing.
  ctx.rotate(facing - Math.PI / 2)
  if (rim) {
    ctx.shadowColor = rim
    ctx.shadowBlur = 20
  }
  ctx.drawImage(layer, -displaySize / 2 - pad, -displaySize / 2 - pad)
  ctx.shadowBlur = 0

  if (flash) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.5
    ctx.drawImage(frame, -displaySize / 2, -displaySize / 2, displaySize, displaySize)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
