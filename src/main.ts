import './styles/game.css'
import type { BoonDef, BoonId } from './data/boons'
import { HEROES, type HeroId } from './data/catalog'
import { ActionGame, type HeroSheet, type RunCarry } from './game/action'
import { audio } from './game/audio'
import { preloadAllSprites } from './game/sprites'
import { publicUrl } from './publicUrl'

const app = document.querySelector<HTMLDivElement>('#app')!

type Screen = 'boot' | 'title' | 'select' | 'play' | 'victory' | 'gameover'

class App {
  screen: Screen = 'boot'
  game: ActionGame | null = null
  toastTimer = 0
  private lastSheet: HeroSheet | null = null

  constructor() {
    this.renderBoot()
    void preloadAllSprites().then(() => {
      this.screen = 'title'
      this.render()
    })
  }

  renderBoot(): void {
    app.innerHTML = `<div class="shell panel end-screen"><h1>VELUM</h1><p>Loading character art…</p></div>`
  }

  render(): void {
    if (this.screen === 'boot') this.renderBoot()
    else if (this.screen === 'title') this.renderTitle()
    else if (this.screen === 'select') this.renderSelect()
    else if (this.screen === 'play') this.renderPlay()
    else if (this.screen === 'victory') this.renderEnd(true)
    else this.renderEnd(false)
  }

  renderTitle(): void {
    app.innerHTML = `
      <div class="shell">
        <section class="title-screen" style="--title-bg: url('${publicUrl('/assets/velum-title-bg.png')}')">
          <div class="title-content">
            <h1 class="brand">VEL<span>UM</span></h1>
            <p class="tagline">Stylized 3D battlefield. Slash, dodge, seal the veil.</p>
            <div class="btn-row"><button class="btn" id="start">Play</button></div>
            <p class="hint">Hold LMB to move · Click enemies to attack · Q skill · RMB dodge</p>
          </div>
        </section>
      </div>`
    app.querySelector('#start')!.addEventListener('click', () => {
      audio.unlock()
      audio.setBed('camp')
      audio.play('ui')
      this.screen = 'select'
      this.render()
    })
  }

  renderSelect(): void {
    app.innerHTML = `
      <div class="shell panel">
        <h1>Choose your fighter</h1>
        <p class="sub">Three fighters. Same veil. Pick your rhythm.</p>
        <div class="hero-grid">
          ${HEROES.map(
            (h) => `
            <button class="hero-card" data-id="${h.id}">
              <img src="${publicUrl(h.image)}" alt="${h.name}" />
              <div class="meta">
                <p class="title">${h.name}</p>
                <p class="role">${h.title}</p>
                <p>${h.blurb}</p>
                <div class="stat-row">
                  <span class="chip">HP ${h.hp}</span>
                  <span class="chip">ATK ${h.atk}</span>
                  <span class="chip">SPD ${h.speed}</span>
                </div>
              </div>
            </button>`,
          ).join('')}
        </div>
      </div>`
    app.querySelectorAll<HTMLButtonElement>('.hero-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock()
        audio.play('ui')
        this.startRun(btn.dataset.id as HeroId)
      })
    })
  }

  startRun(heroId: HeroId, carry?: RunCarry): void {
    this.game?.destroy()
    this.screen = 'play'
    if (!carry) this.lastSheet = null
    this.renderPlay()
    const canvas = app.querySelector<HTMLCanvasElement>('#stage')!
    this.game = new ActionGame(canvas, heroId, (e) => {
      if (e.type === 'toast') this.showToast(e.text)
      if (e.type === 'dialogue') this.showDialogue(e.lines)
      if (e.type === 'crystal') {
        const el = app.querySelector('#crystal-count')
        if (el) el.textContent = `${e.count}/3`
      }
      if (e.type === 'hud') {
        const name = app.querySelector('#hero-name')
        const fill = app.querySelector<HTMLElement>('#hp-fill')
        const hpText = app.querySelector('#hp-text')
        if (name) name.textContent = e.name
        if (fill) fill.style.width = `${(e.hp / e.maxHp) * 100}%`
        if (hpText) {
          const grown = e.sheet.maxHp > e.sheet.baseMaxHp
          hpText.innerHTML = grown
            ? `${Math.ceil(e.hp)} / <span class="stat-up">${e.maxHp}</span>`
            : `${Math.ceil(e.hp)} / ${e.maxHp}`
        }
        const crystals = app.querySelector('#crystal-count')
        if (crystals) crystals.textContent = e.act === 2 ? '' : `${e.crystals}/3`
        const relic = app.querySelector('#relic-label')
        if (relic) relic.textContent = e.relic
        const skill = app.querySelector('#skill-pill')
        if (skill) {
          const ready = e.skillCd <= 0
          skill.classList.toggle('cooling', !ready)
          skill.innerHTML = ready
            ? `Q ${e.skillLabel}`
            : `Q ${e.skillLabel} ${e.skillCd.toFixed(1)}`
        }
        this.paintSheet(e.sheet, e.skillLabel)
        this.paintBoonHud(e.boons)
      }
      if (e.type === 'boonpick') this.showBoonPick(e.options, e.source)
      if (e.type === 'victory') {
        this.game?.setPaused(true)
        window.setTimeout(() => {
          if (e.act === 1) this.showContinue()
          else {
            this.screen = 'victory'
            this.game?.destroy()
            this.game = null
            this.render()
          }
        }, 900)
      }
      if (e.type === 'gameover') {
        this.game?.setPaused(true)
        window.setTimeout(() => this.showFallen(), 700)
      }
    }, carry)
  }

  renderPlay(): void {
    app.innerHTML = `
      <div class="shell play-shell">
        <div class="play-frame">
          <canvas id="stage"></canvas>
          <div class="play-overlay">
            <div class="play-top">
              <div class="hud-card">
                <div class="hud-name" id="hero-name">Hero</div>
                <div class="hud-bar"><span id="hp-fill"></span></div>
                <div class="hud-sub" id="hp-text">—</div>
                <div class="hud-stats" id="hud-stats"></div>
              </div>
              <div class="pill"><span id="relic-label">Crystals</span> <strong id="crystal-count">0/3</strong></div>
              <div class="pill" id="skill-pill">Q Skill</div>
              <div id="boon-hud" class="boon-hud"></div>
              <div class="pill muted">LMB move · RMB dodge · Q skill · E talk</div>
            </div>
            <div id="toast" class="toast hidden"></div>
            <div id="dialogue" class="dialogue-box hidden"></div>
            <div id="boons" class="boon-overlay hidden">
              <div class="boon-panel">
                <h2 id="boon-title">The crystal offers a gift</h2>
                <p id="boon-lead" class="boon-lead">Choose one. It stays if you fall.</p>
                <div id="boon-grid" class="boon-grid"></div>
              </div>
            </div>
            <div id="continue" class="fallen-overlay hidden">
              <div class="fallen-card">
                <h1>The Golem falls</h1>
                <p>The tear sank, not closed. Your sheet is yours. Push the wound.</p>
                <div class="btn-row fallen-actions">
                  <button class="btn" id="continue-run">Continue</button>
                  <button class="btn-quiet" id="leave-run">Return to title</button>
                </div>
              </div>
            </div>
            <div id="fallen" class="fallen-overlay hidden">
              <div class="fallen-card">
                <h1>Fallen</h1>
                <p id="fallen-copy">Crystals stay. Wake at camp.</p>
                <div class="btn-row fallen-actions">
                  <button class="btn" id="rise">Rise</button>
                  <button class="btn-quiet" id="abandon">Abandon run</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`
    app.querySelector('#continue-run')!.addEventListener('click', () => {
      audio.play('ui')
      if (!this.game) return
      const carry = this.game.snapshot()
      const heroId = this.game.hero.id
      this.startRun(heroId, carry)
    })
    app.querySelector('#leave-run')!.addEventListener('click', () => {
      audio.play('ui')
      this.game?.destroy()
      this.game = null
      this.screen = 'title'
      this.render()
    })
    app.querySelector('#rise')!.addEventListener('click', () => {
      audio.play('ui')
      app.querySelector('#fallen')?.classList.add('hidden')
      this.game?.retry()
    })
    app.querySelector('#abandon')!.addEventListener('click', () => {
      audio.play('ui')
      this.game?.destroy()
      this.game = null
      this.screen = 'title'
      this.render()
    })
  }

  showFallen(): void {
    if (!this.game || this.screen !== 'play') return
    const overlay = app.querySelector('#fallen')
    const copy = app.querySelector('#fallen-copy')
    if (!overlay || !copy) return
    const n = this.game.crystals
    const act2 = this.game.act === 2
    copy.textContent =
      act2
        ? this.game.bossUnlocked
          ? 'Gifts stay. You wake at the well. The Colossus resets in the ring.'
          : 'Gifts stay. You wake at camp. The road still waits.'
        : n >= 3
          ? 'Crystals and gifts stay. You wake at the well. The Golem resets in the ring.'
          : n > 0
            ? 'Crystals and gifts stay. You wake at camp.'
            : 'You wake at camp. The crystals still lie in the ruins.'
    overlay.classList.remove('hidden')
  }

  showContinue(): void {
    if (!this.game || this.screen !== 'play') return
    app.querySelector('#continue')?.classList.remove('hidden')
  }

  paintSheet(sheet: HeroSheet, skillLabel: string): void {
    const el = app.querySelector('#hud-stats')
    if (!el) return
    const prev = this.lastSheet
    const changed = !prev || this.sheetChanged(prev, sheet)
    if (!changed && el.childElementCount) return
    const qNow = sheet.qHits > 1 ? `${sheet.qAtk}×${sheet.qHits}` : String(sheet.qAtk)
    const qBase = String(sheet.baseQAtk)
    const cells: { key: keyof HeroSheet | 'q'; label: string; html: string; grown: boolean }[] = [
      {
        key: 'atk',
        label: 'ATK',
        html: this.statValue(sheet.atk, sheet.baseAtk),
        grown: sheet.atk !== sheet.baseAtk,
      },
      {
        key: 'speed',
        label: 'SPD',
        html: this.statValue(sheet.speed, sheet.baseSpeed),
        grown: sheet.speed !== sheet.baseSpeed,
      },
      {
        key: 'q',
        label: `Q ${skillLabel}`,
        html: this.statValue(qNow, qBase, sheet.qAtk !== sheet.baseQAtk || sheet.qHits > 1),
        grown: sheet.qAtk !== sheet.baseQAtk || sheet.qHits > 1,
      },
      {
        key: 'dodge',
        label: 'Dodge',
        html: this.statValue(`${sheet.dodge}s`, `${sheet.baseDodge}s`, sheet.dodge !== sheet.baseDodge),
        grown: sheet.dodge !== sheet.baseDodge,
      },
      {
        key: 'skill',
        label: 'Q CD',
        html: this.statValue(`${sheet.skill}s`, `${sheet.baseSkill}s`, sheet.skill !== sheet.baseSkill),
        grown: sheet.skill !== sheet.baseSkill,
      },
    ]
    el.innerHTML = cells
      .map((c) => {
        const popped = this.sheetPopped(prev, sheet, c.key)
        return `<span class="stat${c.grown ? ' grown' : ''}${popped ? ' pop' : ''}"><em>${c.label}</em> ${c.html}</span>`
      })
      .join('')
    this.lastSheet = { ...sheet }
  }

  private statValue(now: string | number, base: string | number, grown = now !== base): string {
    if (!grown) return `${now}`
    return `<s>${base}</s> ${now}`
  }

  private sheetChanged(a: HeroSheet, b: HeroSheet): boolean {
    return (
      a.atk !== b.atk ||
      a.qAtk !== b.qAtk ||
      a.qHits !== b.qHits ||
      a.speed !== b.speed ||
      a.dodge !== b.dodge ||
      a.skill !== b.skill ||
      a.maxHp !== b.maxHp
    )
  }

  private sheetPopped(prev: HeroSheet | null, sheet: HeroSheet, key: keyof HeroSheet | 'q'): boolean {
    if (!prev) return false
    if (key === 'q') return prev.qAtk !== sheet.qAtk || prev.qHits !== sheet.qHits
    return prev[key] !== sheet[key]
  }

  paintBoonHud(boons: { id: BoonId; name: string }[]): void {
    const row = app.querySelector('#boon-hud')
    if (!row) return
    row.innerHTML = boons.map((b) => `<span class="boon-chip">${b.name}</span>`).join('')
  }

  showBoonPick(options: BoonDef[], source: 'crystal' | 'well' | 'camp' = 'crystal'): void {
    const overlay = app.querySelector('#boons')
    const grid = app.querySelector('#boon-grid')
    const title = app.querySelector('#boon-title')
    const lead = app.querySelector('#boon-lead')
    if (!overlay || !grid || !this.game) return
    if (title) {
      title.textContent =
        source === 'well'
          ? 'The well offers a last gift'
          : source === 'camp'
            ? 'The leftover veil'
            : this.game.act === 2
              ? 'The seal offers a gift'
              : 'The crystal offers a gift'
    }
    if (lead) {
      lead.textContent =
        source === 'well'
          ? 'One more from what you passed. Then the Golem.'
          : source === 'camp'
            ? 'One leftover gift. Then the road — no more crystals.'
            : 'Choose one. It stays if you fall.'
    }
    grid.innerHTML = options
      .map(
        (b, i) => `
        <button class="boon-card" data-id="${b.id}" type="button">
          <span class="boon-key">${i + 1}</span>
          <span class="boon-name">${b.name}</span>
          <span class="boon-blurb">${b.blurb}</span>
        </button>`,
      )
      .join('')
    overlay.classList.remove('hidden')

    const pick = (id: BoonId) => {
      window.removeEventListener('keydown', onKey)
      overlay.classList.add('hidden')
      audio.play('ui')
      this.game?.chooseBoon(id)
    }
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > options.length) return
      e.preventDefault()
      pick(options[n - 1].id)
    }
    grid.querySelectorAll<HTMLButtonElement>('.boon-card').forEach((btn) => {
      btn.addEventListener('click', () => pick(btn.dataset.id as BoonId))
    })
    window.addEventListener('keydown', onKey)
  }

  showToast(text: string): void {
    const el = app.querySelector('#toast')
    if (!el) return
    el.textContent = text
    el.classList.remove('hidden')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => el.classList.add('hidden'), 1800)
  }

  showDialogue(lines: string[]): void {
    const box = app.querySelector('#dialogue')
    if (!box || !this.game) return
    this.game.setPaused(true)
    let i = 0
    const paint = () => {
      box.classList.remove('hidden')
      box.innerHTML = `<p>${lines[i]}</p><button class="btn" id="dlg-next">${i < lines.length - 1 ? 'Continue' : 'Got it'}</button>`
      box.querySelector('#dlg-next')!.addEventListener('click', () => {
        if (i < lines.length - 1) {
          i += 1
          paint()
        } else {
          box.classList.add('hidden')
          this.game?.setPaused(false)
        }
      })
    }
    paint()
  }

  renderEnd(won: boolean): void {
    app.innerHTML = `
      <div class="shell panel end-screen">
        <h1>${won ? 'Veil Sealed' : 'Fallen'}</h1>
        <p>${won ? 'You cut through the deeper tear. The sheet you built held.' : 'Dodge the windup. Strike when they commit. Try again.'}</p>
        <button class="btn" id="again">Play Again</button>
      </div>`
    app.querySelector('#again')!.addEventListener('click', () => {
      this.screen = 'title'
      this.render()
    })
  }
}

new App()
