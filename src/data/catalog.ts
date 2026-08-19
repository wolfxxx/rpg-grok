export type HeroId = 'warden' | 'mystic' | 'scout'
export type EnemyId = 'beetle' | 'wraith' | 'golem' | 'goblin' | 'crab' | 'devil'

export interface HeroDef {
  id: HeroId
  name: string
  title: string
  blurb: string
  /** Character select / UI portrait */
  image: string
  /** In-world top-down sprite */
  sprite: string
  hp: number
  atk: number
  speed: number
  attackCooldown: number
  attackRange: number
  dodgeCooldown: number
  skillCooldown: number
  skillLabel: string
  color: string
  spriteSize: number
}

export interface EnemyDef {
  id: EnemyId
  name: string
  image: string
  sprite: string
  hp: number
  atk: number
  speed: number
  radius: number
  spriteSize: number
  aggro: number
  attackRange: number
  attackCooldown: number
  xp: number
  isBoss?: boolean
}

export const HEROES: HeroDef[] = [
  {
    id: 'warden',
    name: 'Kael',
    title: 'The Warden',
    blurb: 'Heavy slam (Q). Sturdy frame. Slower dodge.',
    image: '/assets/hero-warden.png',
    sprite: '/assets/sprite-warden.png',
    hp: 140,
    atk: 22,
    speed: 195,
    attackCooldown: 0.42,
    attackRange: 62,
    dodgeCooldown: 0.95,
    skillCooldown: 4.0,
    skillLabel: 'Slam',
    color: '#e8a87c',
    spriteSize: 96,
  },
  {
    id: 'mystic',
    name: 'Seris',
    title: 'The Mystic',
    blurb: 'Sigil bolts at range. Q fires a heavier bolt. Fragile.',
    image: '/assets/hero-mystic.png',
    sprite: '/assets/sprite-mystic.png',
    hp: 100,
    atk: 28,
    speed: 210,
    attackCooldown: 0.5,
    attackRange: 84,
    dodgeCooldown: 0.8,
    skillCooldown: 1.7,
    skillLabel: 'Bolt',
    color: '#5eb1bf',
    spriteSize: 92,
  },
  {
    id: 'scout',
    name: 'Nyra',
    title: 'The Scout',
    blurb: 'Q lunges through. Snappy dodges.',
    image: '/assets/hero-scout.png',
    sprite: '/assets/sprite-scout.png',
    hp: 115,
    atk: 18,
    speed: 245,
    attackCooldown: 0.28,
    attackRange: 56,
    dodgeCooldown: 0.55,
    skillCooldown: 2.3,
    skillLabel: 'Lunge',
    color: '#7cbc8a',
    spriteSize: 90,
  },
]

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  beetle: {
    id: 'beetle',
    name: 'Copper Beetle',
    image: '/assets/enemy-beetle.png',
    sprite: '/assets/sprite-beetle.png',
    hp: 48,
    atk: 12,
    speed: 125,
    radius: 26,
    spriteSize: 78,
    aggro: 280,
    attackRange: 108,
    attackCooldown: 1.45,
    xp: 15,
  },
  wraith: {
    id: 'wraith',
    name: 'Mist Wraith',
    image: '/assets/enemy-wraith.png',
    sprite: '/assets/sprite-wraith.png',
    hp: 62,
    atk: 16,
    speed: 145,
    radius: 28,
    spriteSize: 86,
    aggro: 340,
    attackRange: 210,
    attackCooldown: 1.25,
    xp: 25,
  },
  golem: {
    id: 'golem',
    name: 'Ash Golem',
    image: '/assets/enemy-golem.png',
    sprite: '/assets/sprite-golem.png',
    hp: 420,
    atk: 42,
    speed: 96,
    radius: 48,
    spriteSize: 140,
    aggro: 440,
    attackRange: 118,
    attackCooldown: 1.85,
    xp: 100,
    isBoss: true,
  },
  goblin: {
    id: 'goblin',
    name: 'Veilkin',
    image: '/assets/enemy-beetle.png',
    sprite: '/assets/sprite-beetle.png',
    hp: 38,
    atk: 11,
    speed: 178,
    radius: 22,
    spriteSize: 72,
    aggro: 270,
    attackRange: 92,
    attackCooldown: 1.12,
    xp: 18,
  },
  crab: {
    id: 'crab',
    name: 'Scrap Crab',
    image: '/assets/enemy-beetle.png',
    sprite: '/assets/sprite-beetle.png',
    hp: 92,
    atk: 17,
    speed: 90,
    radius: 34,
    spriteSize: 88,
    aggro: 250,
    attackRange: 102,
    attackCooldown: 1.7,
    xp: 28,
  },
  devil: {
    id: 'devil',
    name: 'Ridge Fiend',
    image: '/assets/enemy-wraith.png',
    sprite: '/assets/sprite-wraith.png',
    hp: 158,
    atk: 24,
    speed: 152,
    radius: 32,
    spriteSize: 110,
    aggro: 360,
    attackRange: 186,
    attackCooldown: 1.35,
    xp: 55,
  },
}
