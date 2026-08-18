export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  kind: 'spark' | 'mist' | 'slash' | 'ring' | 'text'
  text?: string
  angle?: number
  length?: number
}

export class Particles {
  list: Particle[] = []

  burst(x: number, y: number, color: string, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 60 + Math.random() * 180
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: 2 + Math.random() * 3,
        color,
        kind: 'spark',
      })
    }
  }

  slash(x: number, y: number, angle: number, color: string): void {
    this.list.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.22,
      maxLife: 0.22,
      size: 8,
      color,
      kind: 'slash',
      angle,
      length: 70,
    })
    this.burst(x + Math.cos(angle) * 30, y + Math.sin(angle) * 30, color, 6)
  }

  ring(x: number, y: number, color: string): void {
    this.list.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.35,
      maxLife: 0.35,
      size: 12,
      color,
      kind: 'ring',
    })
  }

  floatText(x: number, y: number, text: string, color: string): void {
    this.list.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: -55,
      life: 0.8,
      maxLife: 0.8,
      size: 14,
      color,
      kind: 'text',
      text,
    })
  }

  mist(x: number, y: number): void {
    this.list.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 12,
      vy: -8 - Math.random() * 12,
      life: 2.5 + Math.random() * 2,
      maxLife: 4,
      size: 10 + Math.random() * 20,
      color: 'rgba(94,177,191,0.12)',
      kind: 'mist',
    })
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'spark') {
        p.vx *= 0.92
        p.vy *= 0.92
      }
    }
    this.list = this.list.filter((p) => p.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.maxLife
      ctx.globalAlpha = Math.max(0, t)
      if (p.kind === 'spark' || p.kind === 'mist') {
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (p.kind === 'mist' ? 1 : t), 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'slash' && p.angle != null && p.length != null) {
        ctx.strokeStyle = p.color
        ctx.lineWidth = 8 * t
        ctx.lineCap = 'round'
        ctx.shadowColor = p.color
        ctx.shadowBlur = 12
        ctx.beginPath()
        const a0 = p.angle - 1.05
        const a1 = p.angle + 1.05
        ctx.arc(p.x, p.y, p.length, a0, a1)
        ctx.stroke()
        ctx.shadowBlur = 0
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size + (1 - t) * 40, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'text' && p.text) {
        ctx.fillStyle = p.color
        ctx.font = '700 16px Manrope, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(p.text, p.x, p.y)
      }
      ctx.globalAlpha = 1
    }
  }
}
