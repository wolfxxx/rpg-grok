export const WORLD_W = 2240
export const WORLD_H = 1600
export const TILE = 64

export type ActId = 1 | 2

export type Landmarks = {
  spawn: readonly [number, number]
  sage: readonly [number, number]
  c1: readonly [number, number]
  c2: readonly [number, number]
  c3: readonly [number, number]
  heal: readonly [number, number]
  boss: readonly [number, number]
  gate: readonly [number, number]
}

const ACT1_ROCKS: Array<[number, number]> = [
  [8, 4], [9, 4], [10, 4], [8, 5], [9, 5],
  [17, 3], [18, 3], [19, 3], [18, 4], [19, 4],
  [12, 12], [13, 12], [14, 12], [13, 13],
  [21, 13], [22, 13], [21, 14], [22, 14], [23, 14],
  [6, 16], [7, 16], [8, 16], [7, 17],
  [31, 16], [32, 16], [31, 17],
]

const ACT2_ROCKS: Array<[number, number]> = [
  [4, 4], [5, 4], [4, 5],
  [20, 3], [21, 3],
  [16, 14], [17, 14], [16, 15],
  [26, 16], [27, 16], [26, 17],
  [12, 18], [13, 18],
  [30, 10], [31, 10], [30, 11],
]

/** Ruin / boulder clusters. Kept off crystals, heal, and the south glade. */
export let ROCK_POCKETS: Array<[number, number]> = ACT1_ROCKS

export let currentAct: ActId = 1

/** 0 walkable, 1 blocked */
export function buildCollision(): Uint8Array {
  const cols = Math.ceil(WORLD_W / TILE)
  const rows = Math.ceil(WORLD_H / TILE)
  const grid = new Uint8Array(cols * rows)

  const block = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return
    grid[ty * cols + tx] = 1
  }

  // border walls
  for (let x = 0; x < cols; x++) {
    block(x, 0)
    block(x, rows - 1)
    block(x, 1)
    block(x, rows - 2)
  }
  for (let y = 0; y < rows; y++) {
    block(0, y)
    block(cols - 1, y)
    block(1, y)
    block(cols - 2, y)
  }

  // water / ruin blockers — hand-placed pockets
  for (const [x, y] of ROCK_POCKETS) block(x, y)

  return grid
}

export function cols(): number {
  return Math.ceil(WORLD_W / TILE)
}

export function blockedAt(grid: Uint8Array, x: number, y: number, radius: number): boolean {
  const c = cols()
  const samples = [
    [x, y],
    [x - radius, y],
    [x + radius, y],
    [x, y - radius],
    [x, y + radius],
    [x - radius * 0.7, y - radius * 0.7],
    [x + radius * 0.7, y - radius * 0.7],
    [x - radius * 0.7, y + radius * 0.7],
    [x + radius * 0.7, y + radius * 0.7],
  ]
  for (const [sx, sy] of samples) {
    const tx = Math.floor(sx / TILE)
    const ty = Math.floor(sy / TILE)
    if (tx < 0 || ty < 0 || tx >= c || ty >= Math.ceil(WORLD_H / TILE)) return true
    if (grid[ty * c + tx]) return true
  }
  return false
}

/** Two border tiles are solid; keep actors in the walkable interior. */
export const WALK_PAD = TILE * 2 + 28

export function clampWalkable(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(WALK_PAD, Math.min(WORLD_W - WALK_PAD, x)),
    y: Math.max(WALK_PAD, Math.min(WORLD_H - WALK_PAD, y)),
  }
}

/** If a point is inside collision, spiral out to the nearest open spot. */
export function nearestWalkable(
  grid: Uint8Array,
  x: number,
  y: number,
  radius: number,
  preferX = 0,
  preferY = 0,
): { x: number; y: number } {
  const fit = (px: number, py: number) => {
    const c = clampWalkable(px, py)
    return !blockedAt(grid, c.x, c.y, radius) ? c : null
  }
  if (fit(x, y)) return clampWalkable(x, y)
  const plen = Math.hypot(preferX, preferY)
  if (plen > 0.001) {
    const ux = preferX / plen
    const uy = preferY / plen
    for (let d = 6; d <= 200; d += 6) {
      const hit = fit(x + ux * d, y + uy * d)
      if (hit) return hit
    }
  }
  for (let d = 8; d <= 200; d += 8) {
    const steps = 10 + (d >> 3)
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const hit = fit(x + Math.cos(a) * d, y + Math.sin(a) * d)
      if (hit) return hit
    }
  }
  return clampWalkable(x, y)
}

const ACT1_LANDMARKS: Landmarks = {
  spawn: [420, 820],
  sage: [520, 760],
  c1: [820, 500],
  c2: [1560, 640],
  c3: [640, 1100],
  heal: [1880, 1180],
  boss: [1760, 1320],
  gate: [1260, 580],
}

const ACT2_LANDMARKS: Landmarks = {
  spawn: [1760, 400],
  sage: [1580, 460],
  c1: [1180, 520],
  c2: [640, 680],
  c3: [1480, 1080],
  heal: [540, 1220],
  boss: [400, 1360],
  gate: [900, 560],
}

export let LANDMARKS: Landmarks = ACT1_LANDMARKS

const ACT1_PATHS: Array<Array<[number, number]>> = [
  [
    [420, 820],
    [520, 760],
    [680, 620],
    [820, 500],
    [1100, 520],
    [1260, 580],
    [1560, 640],
    [1660, 920],
    [1760, 1320],
  ],
  [
    [520, 760],
    [480, 1020],
    [560, 1080],
    [640, 1100],
  ],
  [
    [1560, 640],
    [1760, 900],
    [1880, 1180],
    [1760, 1320],
  ],
]

const ACT2_PATHS: Array<Array<[number, number]>> = [
  [
    [1760, 400],
    [1580, 460],
    [1180, 520],
    [900, 560],
    [640, 680],
    [560, 960],
    [540, 1220],
    [400, 1360],
  ],
  [
    [1580, 460],
    [1520, 780],
    [1480, 1080],
  ],
]

export let PATHS: Array<Array<[number, number]>> = ACT1_PATHS

export function applyAct(act: ActId): void {
  currentAct = act
  LANDMARKS = act === 2 ? ACT2_LANDMARKS : ACT1_LANDMARKS
  PATHS = act === 2 ? ACT2_PATHS : ACT1_PATHS
  ROCK_POCKETS = act === 2 ? ACT2_ROCKS : ACT1_ROCKS
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

export function distToPath(x: number, y: number): number {
  let best = Infinity
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const d = distToSegment(x, y, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
      if (d < best) best = d
    }
  }
  return best
}

export type SiteId = 'cairn' | 'cart' | 'ridge' | 'stele'

export type StorySite = {
  id: SiteId
  x: number
  y: number
  lines: string[]
}

const ACT2_SITES: StorySite[] = [
  {
    id: 'cairn',
    x: 1680,
    y: 510,
    lines: [
      'A cairn. Names packed in with the stones.',
      'Hale. Orin. The first plug. They held the Golem until this camp could breathe.',
      'The Golem fell. The wound did not. They stacked this anyway.',
    ],
  },
  {
    id: 'cart',
    x: 1020,
    y: 620,
    lines: [
      'A cart on its side. Bedrolls still tied.',
      'They left after the plug failed. The gate is where the road pinched.',
      'No bodies. The veil takes the rest.',
    ],
  },
  {
    id: 'ridge',
    x: 1480,
    y: 1080,
    lines: [
      'The ridge looks on the southwest tear.',
      'It sits lower than it did. A shape walks in it when the light hits.',
      'This is the wound. The road is only how you reach it.',
    ],
  },
  {
    id: 'stele',
    x: 640,
    y: 1160,
    lines: [
      'A well-stone. Older than the camp.',
      'The first plugging was water and waiting. Stand still. It still knows that work.',
      'Trash does not honor it. The Colossus cannot climb out this far.',
    ],
  },
]

export function storySites(): StorySite[] {
  return currentAct === 2 ? ACT2_SITES : []
}

export function storySpots(): Array<readonly [number, number]> {
  return storySites().map((s) => [s.x, s.y] as const)
}

export function siteById(id: string): StorySite | undefined {
  return storySites().find((s) => s.id === id)
}

export interface WorldProp {
  kind: 'crystal' | 'sage' | 'heal' | 'spawn' | 'site'
  x: number
  y: number
  id?: string
  taken?: boolean
}

export function createProps(): WorldProp[] {
  const L = LANDMARKS
  const base: WorldProp[] = [
    { kind: 'spawn', x: L.spawn[0], y: L.spawn[1] },
    { kind: 'sage', x: L.sage[0], y: L.sage[1] },
    { kind: 'heal', x: L.heal[0], y: L.heal[1] },
  ]
  if (currentAct === 2) {
    return [...base, ...storySites().map((s) => ({ kind: 'site' as const, x: s.x, y: s.y, id: s.id }))]
  }
  return [
    ...base,
    { kind: 'crystal', x: L.c1[0], y: L.c1[1], id: 'c1' },
    { kind: 'crystal', x: L.c2[0], y: L.c2[1], id: 'c2' },
    { kind: 'crystal', x: L.c3[0], y: L.c3[1], id: 'c3' },
  ]
}

export type AmbushFoe = { id: 'beetle' | 'wraith'; dx: number; dy: number }

export type Ambush = {
  key: string
  x: number
  y: number
  r: number
  toast: string
  foes: AmbushFoe[]
}

/** Act 2 keeps two fights. The rest of the road is for walking and reading. */
export function createAmbushes(): Ambush[] {
  if (currentAct !== 2) return []
  const L = LANDMARKS
  return [
    {
      key: 'gate',
      x: L.gate[0],
      y: L.gate[1],
      r: 150,
      toast: 'Something still hunts the pinch.',
      foes: [
        { id: 'beetle', dx: -80, dy: 30 },
        { id: 'wraith', dx: 40, dy: -70 },
      ],
    },
    {
      key: 'approach',
      x: 620,
      y: 1020,
      r: 140,
      toast: 'The well is not a hold.',
      foes: [
        { id: 'beetle', dx: 70, dy: -20 },
        { id: 'wraith', dx: -40, dy: 70 },
      ],
    },
  ]
}

export interface EnemySpawn {
  id: 'beetle' | 'wraith' | 'golem'
  x: number
  y: number
  key: string
}

export function createEnemySpawns(): EnemySpawn[] {
  if (currentAct === 2) {
    return [{ id: 'golem', x: LANDMARKS.boss[0], y: LANDMARKS.boss[1], key: 'boss' }]
  }
  return [
    { id: 'beetle', x: 640, y: 640, key: 'road1' },
    { id: 'beetle', x: 740, y: 460, key: 'c1a' },
    { id: 'beetle', x: 900, y: 440, key: 'c1b' },
    { id: 'beetle', x: 860, y: 580, key: 'c1c' },
    { id: 'beetle', x: 1220, y: 560, key: 'eastA' },
    { id: 'beetle', x: 1300, y: 620, key: 'eastB' },
    { id: 'wraith', x: 1280, y: 500, key: 'eastC' },
    { id: 'beetle', x: 1580, y: 750, key: 'c2a' },
    { id: 'beetle', x: 1680, y: 680, key: 'c2b' },
    { id: 'wraith', x: 1660, y: 540, key: 'c2c' },
    { id: 'wraith', x: 1720, y: 640, key: 'c2d' },
    { id: 'beetle', x: 540, y: 1090, key: 'c3door' },
    { id: 'beetle', x: 700, y: 1120, key: 'c3a' },
    { id: 'wraith', x: 760, y: 1080, key: 'c3b' },
    { id: 'wraith', x: 720, y: 1180, key: 'c3c' },
    { id: 'golem', x: LANDMARKS.boss[0], y: LANDMARKS.boss[1], key: 'boss' },
  ]
}
