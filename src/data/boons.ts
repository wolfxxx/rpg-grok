import type { HeroId } from './catalog'

export type BoonId = 'fang' | 'swift' | 'surge' | 'ward' | 'stride' | 'quake' | 'fork' | 'leech'

export type BoonDef = {
  id: BoonId
  name: string
  blurb: string
  hero?: HeroId
}

export const BOONS: BoonDef[] = [
  { id: 'fang', name: 'Fang', blurb: 'Your strikes bite harder.' },
  { id: 'swift', name: 'Swift', blurb: 'Dodge recovers faster. Longer i-frames.' },
  { id: 'surge', name: 'Surge', blurb: 'Q recovers faster and hits harder.' },
  { id: 'ward', name: 'Ward', blurb: 'A thicker hide. Gain max HP.' },
  { id: 'stride', name: 'Stride', blurb: 'You cover ground faster.' },
  { id: 'quake', name: 'Quake', blurb: 'Slam hits a wider crater.', hero: 'warden' },
  { id: 'fork', name: 'Fork', blurb: 'Heavy bolt splits into a triad.', hero: 'mystic' },
  { id: 'leech', name: 'Leech', blurb: 'Lunge drinks a sliver of life.', hero: 'scout' },
]

export function boonById(id: BoonId): BoonDef {
  return BOONS.find((b) => b.id === id)!
}

export function offerBoons(hero: HeroId, owned: BoonId[]): BoonDef[] {
  const pool = BOONS.filter((b) => !owned.includes(b.id) && (!b.hero || b.hero === hero))
  const unique = pool.find((b) => b.hero === hero)
  const rest = pool.filter((b) => b !== unique)
  shuffle(rest)
  const pick: BoonDef[] = []
  if (unique) pick.push(unique)
  for (const b of rest) {
    if (pick.length >= 3) break
    pick.push(b)
  }
  shuffle(pick)
  return pick.slice(0, 3)
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
}
