import type { AgentCall } from '@antumi/protocol'
import { isDarkTheme, onThemeChange } from './appearance'

// How one line of a fan-out stands, from its call: waiting to start, at work, waiting on the user,
// or over one way or another.
export type LineState = 'queued' | 'running' | 'awaiting' | 'completed' | 'failed' | 'cancelled'

export function lineState(call: Pick<AgentCall, 'state'>): LineState {
  return call.state === 'starting' ? 'running' : call.state
}

// The caller's colour: a member waiting on the user outweighs work going on, which outweighs the end.
export type FanoutMood = 'running' | 'awaiting' | 'completed' | 'failed'

export function fanoutMood(states: readonly LineState[]): FanoutMood {
  if (states.includes('awaiting')) return 'awaiting'
  if (states.some((state) => state === 'running' || state === 'queued')) return 'running'
  return states.includes('failed') ? 'failed' : 'completed'
}

export function lineOver(state: LineState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled'
}

type Point = { x: number; y: number }
type Path = { from: Point; to: Point; c1: Point; c2: Point }
type Dot = { line: number; t: number; speed: number; size: number; color: string; comet?: boolean; fade?: number; onArrive?: () => void }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; decay: number; size: number; color: string }
type Ring = { x: number; y: number; r: number; life: number; grow: number; color: string }
type Palette = { accent: string; running: string; awaiting: string; completed: string; failed: string; quiet: string; track: string }

// Curves from the caller to each member, in canvas pixels: what the component measures.
export type FanoutLayout = { caller: Point; ends: Point[] }

function at(p: Path, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p.from.x + 3 * u * u * t * p.c1.x + 3 * u * t * t * p.c2.x + t * t * t * p.to.x,
    y: u * u * u * p.from.y + 3 * u * u * t * p.c1.y + 3 * u * t * t * p.c2.y + t * t * t * p.to.y
  }
}

// A colour of any CSS syntax at an opacity, read back from a 1×1 canvas so the theme's own values work.
const probe = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
const parsed = new Map<string, [number, number, number]>()
function rgb(color: string): [number, number, number] {
  const known = parsed.get(color)
  if (known) return known
  let value: [number, number, number] = [128, 128, 128]
  if (probe) {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = color
    probe.fillRect(0, 0, 1, 1)
    const [r = 128, g = 128, b = 128] = probe.getImageData(0, 0, 1, 1).data
    value = [r, g, b]
  }
  parsed.set(color, value)
  return value
}
const rgba = (color: string, alpha: number) => { const [r, g, b] = rgb(color); return `rgba(${r}, ${g}, ${b}, ${alpha})` }

// The lines, dots and sparks between a caller and its members, on one canvas over the fan-out.
// It draws frames only while something moves and the canvas is on screen; with reduced motion it
// draws the lines once and nothing else.
export class DelegationParticles {
  private readonly context: CanvasRenderingContext2D | null
  private states: LineState[] = []
  private dots: Dot[] = []
  private sparks: Spark[] = []
  private rings: Ring[] = []
  private frame = 0
  private lastEmit = 0
  private visible = true
  private colors: Palette | null = null
  private disposed = false
  private readonly observer: IntersectionObserver | null
  private readonly onVisibility = () => this.wake()
  private readonly offTheme: () => void
  private dark: boolean | null = null

  constructor(private readonly canvas: HTMLCanvasElement, private readonly measure: () => FanoutLayout | null) {
    this.context = canvas.getContext('2d')
    this.observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true
      this.wake()
    })
    this.observer?.observe(canvas)
    document.addEventListener('visibilitychange', this.onVisibility)
    // Read again at the next frame, once the new theme's styles apply.
    this.offTheme = onThemeChange(() => { this.colors = null; this.dark = null; this.wake() })
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.observer?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.offTheme()
  }

  private get still(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // New states for the lines; a member that just finished sends a light back to the caller.
  setStates(states: readonly LineState[]): void {
    const before = this.states
    this.states = [...states]
    if (!this.still) states.forEach((state, line) => {
      const was = before[line]
      if (was === undefined || was === state) return
      const end = this.path(line)?.to
      if (end && state !== 'cancelled') this.burst(end, this.tone(state), state === 'completed' ? 12 : 8, 1.1)
      if (state === 'completed') this.dots.push({ line, t: 1, speed: -0.009, size: 2.6, comet: true, color: this.palette().completed })
    })
    this.wake()
  }

  // Work going out: a light from the caller to each member named, one after another.
  dispatch(lines: readonly number[]): void {
    if (this.still || lines.length === 0) return this.wake()
    const caller = this.measure()?.caller
    if (caller) {
      this.burst(caller, this.palette().accent, 14, 1.3)
      this.rings.push({ ...caller, r: 10, life: 1, grow: 0.7, color: this.palette().accent })
    }
    lines.forEach((line, order) => setTimeout(() => {
      if (!this.disposed) { this.dots.push({ line, t: 0, speed: 0.008, size: 2.8, comet: true, color: this.palette().accent }); this.wake() }
    }, 380 * order))
    this.wake()
  }

  // All of it back: the caller flares once.
  converge(): void {
    const caller = this.measure()?.caller
    if (this.still || !caller) return this.wake()
    this.burst(caller, this.palette().completed, 22, 1.4)
    this.rings.push({ ...caller, r: 12, life: 1, grow: 0.55, color: this.palette().completed }, { ...caller, r: 6, life: 1.3, grow: 0.45, color: this.palette().accent })
    this.wake()
  }

  // Draws once now, and keeps drawing while anything moves.
  wake(): void {
    if (this.disposed || this.frame) return
    this.frame = requestAnimationFrame((now) => this.draw(now))
  }

  // The theme's colours, read once and again when the theme changes. A token written as
  // light-dark() reads back unresolved, so each goes through an element's color to resolve.
  private palette(): Palette {
    if (this.colors) return this.colors
    const read = (name: string, fallback: string) => {
      this.canvas.style.color = `var(${name}, ${fallback})`
      return getComputedStyle(this.canvas).color || fallback
    }
    this.colors = {
      accent: read('--accent', '#c2542d'), running: read('--status-running', '#2f6fdb'), awaiting: read('--warning', '#c79a1c'),
      completed: read('--status-done', '#3b8a4f'), failed: read('--danger', '#b3261e'), quiet: read('--text-3', '#999'), track: read('--border-2', '#e3e3e3')
    }
    this.canvas.style.color = ''
    return this.colors
  }

  private tone(state: LineState): string {
    const palette = this.palette()
    return state === 'queued' ? palette.accent : state === 'cancelled' ? palette.quiet : palette[state]
  }

  private path(line: number, layout = this.measure()): Path | null {
    const end = layout?.ends[line]
    if (!layout || !end) return null
    const dx = end.x - layout.caller.x
    return { from: layout.caller, to: end, c1: { x: layout.caller.x + dx * 0.5, y: layout.caller.y }, c2: { x: end.x - dx * 0.5, y: end.y } }
  }

  private burst(point: Point, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.4 + Math.random())
      this.sparks.push({ ...point, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: 1, decay: 0.012 + Math.random() * 0.012, size: 0.7 + Math.random() * 1.1, color })
    }
  }

  private glow(context: CanvasRenderingContext2D, point: Point, size: number, color: string, alpha: number): void {
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, size * 3)
    gradient.addColorStop(0, rgba(color, 0.9))
    gradient.addColorStop(0.35, rgba(color, 0.35))
    gradient.addColorStop(1, rgba(color, 0))
    context.globalAlpha = alpha * 0.55
    context.fillStyle = gradient
    context.beginPath(); context.arc(point.x, point.y, size * 3, 0, Math.PI * 2); context.fill()
    context.globalAlpha = alpha
    context.fillStyle = '#fff'
    context.beginPath(); context.arc(point.x, point.y, size * 0.55, 0, Math.PI * 2); context.fill()
    context.globalAlpha = alpha * 0.9
    context.fillStyle = color
    context.beginPath(); context.arc(point.x, point.y, size * 0.9, 0, Math.PI * 2); context.fill()
  }

  // A steady trickle along lines at work or waiting, slower and sparser while waiting.
  private emit(now: number): void {
    if (now - this.lastEmit < 160) return
    this.lastEmit = now
    const palette = this.palette()
    this.states.forEach((state, line) => {
      if (state === 'running' && Math.random() < 0.45) this.dots.push({ line, t: 0, speed: 0.0028 + Math.random() * 0.0022, size: 0.8 + Math.random() * 0.9, color: palette.running })
      if (state === 'awaiting' && Math.random() < 0.1) this.dots.push({ line, t: 0, speed: 0.0016 + Math.random() * 0.001, size: 0.9 + Math.random() * 0.8, color: palette.awaiting })
    })
  }

  private draw(now: number): void {
    this.frame = 0
    const context = this.context
    const layout = this.measure()
    if (!context || !layout) return
    const dpr = devicePixelRatio || 1
    const { clientWidth: width, clientHeight: height } = this.canvas
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr)
      this.canvas.height = Math.round(height * dpr)
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    context.globalCompositeOperation = 'source-over'
    const palette = this.palette()
    this.states.forEach((state, line) => {
      const p = this.path(line, layout)
      if (!p) return
      const dashed = state === 'queued' || state === 'cancelled' || state === 'failed'
      context.beginPath(); context.moveTo(p.from.x, p.from.y); context.bezierCurveTo(p.c1.x, p.c1.y, p.c2.x, p.c2.y, p.to.x, p.to.y)
      context.strokeStyle = state === 'queued' ? palette.track : this.tone(state)
      context.globalAlpha = state === 'queued' ? 1 : state === 'cancelled' ? 0.35 : 0.3
      context.lineWidth = dashed ? 1 : 1.6
      context.setLineDash(dashed ? [3, 4] : [])
      context.stroke()
      context.setLineDash([])
    })
    context.globalAlpha = 1
    // Nothing moves with reduced motion, nor while nobody can see it: the lines stand as they are.
    if (this.still || !this.visible || document.hidden) { this.dots = []; this.sparks = []; this.rings = []; return }

    this.emit(now)
    this.dark ??= isDarkTheme()
    context.globalCompositeOperation = this.dark ? 'lighter' : 'source-over'
    this.dots = this.dots.filter((dot) => {
      const state = this.states[dot.line]
      if (!dot.comet && state !== 'running' && state !== 'awaiting') dot.fade = (dot.fade ?? 1) - 0.06
      if (dot.fade !== undefined && dot.fade <= 0) return false
      const p = this.path(dot.line, layout)
      if (!p) return false
      dot.t += dot.speed
      if (dot.t >= 1 || dot.t <= 0) {
        dot.onArrive?.()
        if (dot.speed < 0) this.burst(p.from, dot.color, 6, 0.9)
        return false
      }
      if (dot.comet) for (let k = 1; k <= 10; k++) {
        this.glow(context, at(p, Math.max(0, Math.min(1, dot.t - dot.speed * k * 1.4))), dot.size * (1 - k / 12), dot.color, 0.4 * (1 - k / 10))
      }
      this.glow(context, at(p, dot.t), dot.size, dot.color, dot.fade ?? 1)
      return true
    })
    this.sparks = this.sparks.filter((spark) => {
      spark.x += spark.vx; spark.y += spark.vy; spark.vx *= 0.95; spark.vy *= 0.95; spark.life -= spark.decay
      if (spark.life <= 0) return false
      this.glow(context, spark, spark.size, spark.color, spark.life)
      return true
    })
    this.rings = this.rings.filter((ring) => {
      ring.r += ring.grow; ring.life -= 0.016
      if (ring.life <= 0) return false
      context.globalAlpha = Math.min(1, ring.life) * 0.7
      context.strokeStyle = ring.color
      context.lineWidth = 1.5
      context.beginPath(); context.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); context.stroke()
      return true
    })
    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-over'
    const moving = this.dots.length > 0 || this.sparks.length > 0 || this.rings.length > 0 || this.states.some((state) => state === 'running' || state === 'awaiting')
    if (moving) this.frame = requestAnimationFrame((next) => this.draw(next))
  }
}
