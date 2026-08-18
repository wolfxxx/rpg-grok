import { WORLD_H, WORLD_W, TILE, cols, type WorldProp } from '../data/world'
import { publicUrl } from '../publicUrl'
import { drawAnimatedSprite, getSpriteSet } from './sprites'

export function loadImage(src: string): HTMLImageElement {
  const img = new Image()
  img.decoding = 'async'
  img.src = publicUrl(src)
  return img
}

export class Gfx {
  ground = loadImage('/assets/tex-ground.png')
  mapArt = loadImage('/assets/overworld-map.png')
  crystal = loadImage('/assets/prop-crystal.png')
  spring = loadImage('/assets/prop-spring.png')
  ruin = loadImage('/assets/prop-ruin.png')

  /** Pattern cache once ground loads */
  private groundPattern: CanvasPattern | null = null

  ensurePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.groundPattern) return this.groundPattern
    if (!this.ground.complete || !this.ground.naturalWidth) return null
    this.groundPattern = ctx.createPattern(this.ground, 'repeat')
    return this.groundPattern
  }

  drawWorld(
    ctx: CanvasRenderingContext2D,
    collision: Uint8Array,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
  ): void {
    // base fill
    ctx.fillStyle = '#161c22'
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)

    const pattern = this.ensurePattern(ctx)
    if (pattern) {
      ctx.save()
      // scale pattern for nicer tile size
      const matrix = new DOMMatrix().scale(0.45)
      pattern.setTransform(matrix)
      ctx.fillStyle = pattern
      ctx.globalAlpha = 1
      ctx.fillRect(0, 0, WORLD_W, WORLD_H)
      ctx.restore()
    }

    // painted map wash for atmosphere
    if (this.mapArt.complete && this.mapArt.naturalWidth) {
      ctx.save()
      ctx.globalAlpha = 0.38
      ctx.drawImage(this.mapArt, 0, 0, WORLD_W, WORLD_H)
      ctx.restore()
      ctx.fillStyle = 'rgba(12, 18, 22, 0.22)'
      ctx.fillRect(0, 0, WORLD_W, WORLD_H)
    }

    // only draw blockers near camera for perf
    const c = cols()
    const rows = Math.ceil(WORLD_H / TILE)
    const x0 = Math.max(0, Math.floor((camX - viewW / 2) / TILE) - 1)
    const y0 = Math.max(0, Math.floor((camY - viewH / 2) / TILE) - 1)
    const x1 = Math.min(c - 1, Math.ceil((camX + viewW / 2) / TILE) + 1)
    const y1 = Math.min(rows - 1, Math.ceil((camY + viewH / 2) / TILE) + 1)

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!collision[ty * c + tx]) continue
        const px = tx * TILE
        const py = ty * TILE
        // dark rock slab
        ctx.fillStyle = 'rgba(10, 14, 18, 0.72)'
        ctx.fillRect(px, py, TILE, TILE)
        if (this.ruin.complete && this.ruin.naturalWidth && (tx + ty) % 2 === 0) {
          ctx.globalAlpha = 0.55
          ctx.drawImage(this.ruin, px - 8, py - 8, TILE + 16, TILE + 16)
          ctx.globalAlpha = 1
        } else {
          ctx.strokeStyle = 'rgba(232, 168, 124, 0.08)'
          ctx.strokeRect(px + 6, py + 6, TILE - 12, TILE - 12)
        }
      }
    }

    // path edge vignette lines — subtle
    ctx.strokeStyle = 'rgba(94, 177, 191, 0.04)'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const y = 200 + i * 240
      ctx.beginPath()
      ctx.moveTo(120, y)
      ctx.lineTo(WORLD_W - 120, y + 40)
      ctx.stroke()
    }
  }

  drawLight(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
    const g = ctx.createRadialGradient(x, y, 8, x, y, radius)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  drawProp(ctx: CanvasRenderingContext2D, p: WorldProp, time: number): void {
    if (p.kind === 'crystal' && !p.taken) {
      const bob = Math.sin(time * 3 + p.x * 0.01) * 5
      this.drawLight(ctx, p.x, p.y, 70, 'rgba(94,177,191,0.22)')
      if (this.crystal.complete) {
        const s = 56
        ctx.drawImage(this.crystal, p.x - s / 2, p.y - s / 2 + bob, s, s)
      }
    }
    if (p.kind === 'heal') {
      const pulse = 1 + Math.sin(time * 2.5) * 0.06
      this.drawLight(ctx, p.x, p.y, 90, 'rgba(94,177,191,0.18)')
      if (this.spring.complete) {
        const s = 96 * pulse
        ctx.drawImage(this.spring, p.x - s / 2, p.y - s / 2, s, s)
      }
    }
    if (p.kind === 'sage') {
      this.drawLight(ctx, p.x, p.y, 60, 'rgba(232,168,124,0.14)')
      const sage = getSpriteSet('sage').idle
      const fi = sage.frames.length
        ? Math.floor(time * sage.fps) % sage.frames.length
        : 0
      drawAnimatedSprite(
        ctx,
        sage.frames[fi] ?? sage.frames[0],
        p.x,
        p.y,
        88,
        Math.PI / 2,
        false,
        '#e8a87c',
      )
      ctx.fillStyle = 'rgba(18,24,28,0.75)'
      ctx.fillRect(p.x - 36, p.y + 34, 72, 16)
      ctx.fillStyle = '#e8a87c'
      ctx.font = '700 10px Manrope, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Elder Voss', p.x, p.y + 45)
    }
  }

  drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number, color: string): void {
    const h = 6
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y, w, h, 3)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y, Math.max(0, w * ratio), h, 3)
    ctx.fill()
  }

  drawMoveMarker(ctx: CanvasRenderingContext2D, x: number, y: number, life: number): void {
    const t = Math.max(0, Math.min(1, life / 0.55))
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = `rgba(232, 168, 124, ${0.2 + t * 0.75})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 12 + (1 - t) * 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-14, 0)
    ctx.lineTo(14, 0)
    ctx.moveTo(0, -14)
    ctx.lineTo(0, 14)
    ctx.stroke()
    ctx.restore()
  }

  drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(8, 12, 16, 0.55)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}
