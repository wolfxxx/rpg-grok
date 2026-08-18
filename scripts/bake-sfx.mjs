/** Bake short original foley WAVs into public/sfx. Not a store pack. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx')
mkdirSync(outDir, { recursive: true })

const RATE = 22050

function clamp(v) {
  return Math.max(-1, Math.min(1, v))
}

function wav(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE((clamp(samples[i]) * 32767) | 0, 44 + i * 2)
  return buf
}

function env(i, n, a, d) {
  const t = i / n
  if (t < a) return t / a
  return Math.exp(-((t - a) / Math.max(0.001, d)) * 6)
}

function noise(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1
  }
}

function lowpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff)
  const dt = 1 / RATE
  const a = dt / (rc + dt)
  let y = 0
  return samples.map((x) => {
    y += a * (x - y)
    return y
  })
}

function render(seconds, fn) {
  const n = Math.floor(RATE * seconds)
  const samples = new Float64Array(n)
  for (let i = 0; i < n; i++) samples[i] = fn(i, n, i / RATE)
  return samples
}

function mix(...layers) {
  const n = Math.max(...layers.map((l) => l.length))
  const out = new Float64Array(n)
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) out[i] += layer[i]
  }
  let peak = 0.001
  for (const v of out) peak = Math.max(peak, Math.abs(v))
  const g = 0.92 / peak
  for (let i = 0; i < n; i++) out[i] *= g
  return out
}

function save(name, samples) {
  writeFileSync(join(outDir, `${name}.wav`), wav(samples))
}

const rnd = noise(0x51e11)

save(
  'swing',
  mix(
    lowpass(
      render(0.16, (i, n) => rnd() * env(i, n, 0.04, 0.55) * (0.4 + (1 - i / n))),
      1800,
    ),
    render(0.12, (i, n, t) => Math.sin(2 * Math.PI * (240 - t * 900) * t) * env(i, n, 0.02, 0.7) * 0.22),
  ),
)

save(
  'hit',
  mix(
    lowpass(
      render(0.14, (i, n) => rnd() * env(i, n, 0.01, 0.45)),
      900,
    ),
    render(0.16, (i, n, t) => Math.sin(2 * Math.PI * (90 * Math.exp(-t * 8)) * t) * env(i, n, 0.005, 0.5) * 0.9),
    render(0.04, (i, n) => rnd() * env(i, n, 0.002, 0.35) * 0.5),
  ),
)

save(
  'hurt',
  mix(
    render(0.2, (i, n, t) => Math.sin(2 * Math.PI * (280 - t * 900) * t) * env(i, n, 0.02, 0.55) * 0.55),
    lowpass(
      render(0.14, (i, n) => rnd() * env(i, n, 0.02, 0.5)),
      700,
    ),
  ),
)

save(
  'die',
  mix(
    lowpass(
      render(0.32, (i, n) => rnd() * env(i, n, 0.04, 0.7)),
      420,
    ),
    render(0.34, (i, n, t) => Math.sin(2 * Math.PI * (110 - t * 180) * t) * env(i, n, 0.03, 0.8) * 0.45),
  ),
)

save(
  'crystal',
  mix(
    render(0.28, (i, n, t) => Math.sin(2 * Math.PI * 880 * t) * env(i, n, 0.02, 0.55) * 0.35),
    render(0.3, (i, n, t) => Math.sin(2 * Math.PI * 1320 * t) * env(i, n, 0.08, 0.5) * 0.28),
    render(0.32, (i, n, t) => Math.sin(2 * Math.PI * 1760 * t) * env(i, n, 0.14, 0.55) * 0.18),
  ),
)

save(
  'dodge',
  mix(
    lowpass(
      render(0.16, (i, n) => rnd() * env(i, n, 0.03, 0.5)),
      2200,
    ),
    render(0.12, (i, n, t) => Math.sin(2 * Math.PI * (420 - t * 800) * t) * env(i, n, 0.02, 0.6) * 0.25),
  ),
)

save(
  'foot',
  lowpass(
    render(0.07, (i, n) => rnd() * env(i, n, 0.01, 0.4) * 0.7),
    280,
  ),
)

save(
  'ui',
  mix(
    render(0.08, (i, n, t) => Math.sin(2 * Math.PI * 640 * t) * env(i, n, 0.01, 0.45) * 0.35),
    render(0.1, (i, n, t) => Math.sin(2 * Math.PI * 960 * t) * env(i, n, 0.04, 0.4) * 0.22),
  ),
)

save(
  'heal',
  mix(
    render(0.22, (i, n, t) => Math.sin(2 * Math.PI * 523 * t) * env(i, n, 0.02, 0.55) * 0.3),
    render(0.24, (i, n, t) => Math.sin(2 * Math.PI * 784 * t) * env(i, n, 0.08, 0.5) * 0.28),
  ),
)

save(
  'boss',
  mix(
    render(0.55, (i, n, t) => Math.sin(2 * Math.PI * (55 + Math.sin(t * 8) * 2) * t) * env(i, n, 0.05, 0.85) * 0.7),
    lowpass(
      render(0.4, (i, n) => rnd() * env(i, n, 0.04, 0.7)),
      380,
    ),
  ),
)

save(
  'win',
  mix(
    render(0.22, (i, n, t) => Math.sin(2 * Math.PI * 523 * t) * env(i, n, 0.02, 0.5) * 0.32),
    render(0.28, (i, n, t) => Math.sin(2 * Math.PI * 659 * t) * env(i, n, 0.12, 0.5) * 0.3),
    render(0.4, (i, n, t) => Math.sin(2 * Math.PI * 784 * t) * env(i, n, 0.22, 0.55) * 0.34),
  ),
)

save(
  'lose',
  mix(
    render(0.4, (i, n, t) => Math.sin(2 * Math.PI * (196 - t * 80) * t) * env(i, n, 0.03, 0.7) * 0.4),
    render(0.48, (i, n, t) => Math.sin(2 * Math.PI * (147 - t * 60) * t) * env(i, n, 0.1, 0.75) * 0.32),
  ),
)

console.log('baked sfx into public/sfx')
