import { LANDMARKS, ROCK_POCKETS, TILE, WORLD_H, WORLD_W, distToPath } from '../data/world'

const SCALE = 0.04

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t))
}

function smooth01(t: number): number {
  t = clamp01(t)
  return t * t * (3 - 2 * t)
}

function noise(x: number, y: number): number {
  return (
    Math.sin(x * 0.011) * Math.cos(y * 0.01) * 0.55 +
    Math.sin((x + y) * 0.0065) * 0.35 +
    Math.sin(x * 0.023 - y * 0.017) * 0.18
  )
}

function mound(d: number, radius: number): number {
  if (d >= radius) return 0
  const t = 1 - d / radius
  return t * t * (3 - 2 * t)
}

/** Terrain height in meters from game-pixel XZ. */
export function heightAtGame(gx: number, gy: number): number {
  let h = 0.05 + noise(gx, gy) * 0.1

  const onPath = 1 - smooth01((distToPath(gx, gy) - 26) / 52)
  h = h * (1 - onPath * 0.88) + 0.015 * onPath

  const db = Math.hypot(gx - LANDMARKS.boss[0], gy - LANDMARKS.boss[1])
  h += 0.52 * mound(db, 188)
  if (db > 145 && db < 205) {
    const rim = 1 - Math.abs(db - 175) / 30
    h += 0.2 * Math.max(0, rim)
  }

  const dh = Math.hypot(gx - LANDMARKS.heal[0], gy - LANDMARKS.heal[1])
  h -= 0.12 * mound(dh, 70)

  const ds = Math.hypot(gx - LANDMARKS.spawn[0], gy - LANDMARKS.spawn[1])
  h += 0.08 * mound(ds, 120)

  for (const [tx, ty] of ROCK_POCKETS) {
    const cx = tx * TILE + TILE / 2
    const cy = ty * TILE + TILE / 2
    h += 0.5 * mound(Math.hypot(gx - cx, gy - cy), 72)
  }

  const edge = Math.min(gx, gy, WORLD_W - gx, WORLD_H - gy)
  const cliff = 1 - smooth01((edge - 18) / 128)
  h += 1.7 * cliff * cliff

  return h
}

export function heightAtWorld(wx: number, wz: number): number {
  return heightAtGame(wx / SCALE, wz / SCALE)
}
