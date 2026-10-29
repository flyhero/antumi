import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AgentCall } from '@antumi/protocol'
import { DelegationParticles, fanoutMood, lineOver, lineState, type FanoutLayout } from '../delegation-particles'
import { t } from '../i18n'
import { messageTime } from '../labels'
import { ChatDelegationCard } from './ChatDelegationCard'

// The rings round the caller reach this far from its centre; lines leave from past them.
const RING_REACH = 41
const FLASH_MS = 700

function summary(calls: readonly AgentCall[]): string {
  const states = calls.map(lineState)
  const count = (...wanted: string[]) => states.filter((state) => wanted.includes(state)).length
  const working = count('running', 'queued'), awaiting = count('awaiting'), done = count('completed'), failed = count('failed')
  return [
    working && t('AgentProfiles.summaryWorking', { count: working }),
    awaiting && t('AgentProfiles.summaryAwaiting', { count: awaiting }),
    done && t('AgentProfiles.summaryDone', { count: done }),
    failed && t('AgentProfiles.summaryFailed', { count: failed })
  ].filter(Boolean).join(' · ')
}

// The calls one turn sent out, as one fan-out: the caller, a glowing orb ringed like a HUD core,
// on the left; a line to each member's card on the right, lights running along it while the member
// works. The orb and rings take the colour of how the batch stands. One call is drawn the same way,
// with one straight line.
export function ChatDelegationGroup({ calls, fresh = false }: { calls: readonly AgentCall[]; fresh?: boolean }) {
  const ordered = useMemo(() => [...calls].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), [calls])
  const states = ordered.map(lineState)
  const mood = fanoutMood(states)
  const single = ordered.length === 1
  const over = states.every(lineOver)
  const root = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const core = useRef<HTMLDivElement>(null)
  const caller = useRef<HTMLDivElement>(null)
  const particles = useRef<DelegationParticles | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const wasOver = useRef(over)
  const [flash, setFlash] = useState(false)
  const [lift, setLift] = useState(0)

  // Where the lines run, in the canvas's own pixels.
  const measure = (): FanoutLayout | null => {
    const box = root.current?.getBoundingClientRect()
    const orb = core.current?.getBoundingClientRect()
    if (!box || !orb || !root.current || orb.width === 0) return null
    const ends = [...root.current.querySelectorAll('.chat-delegation')].map((card) => {
      const edge = card.getBoundingClientRect()
      const anchor = card.querySelector('[data-line-end]')?.getBoundingClientRect() ?? edge
      return { x: edge.left - box.left - 1, y: anchor.top + anchor.height / 2 - box.top }
    })
    return { caller: { x: orb.left + orb.width / 2 - box.left + RING_REACH, y: orb.top + orb.height / 2 - box.top }, ends }
  }
  const measureRef = useRef(measure)
  measureRef.current = measure

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const engine = new DelegationParticles(element, () => measureRef.current())
    particles.current = engine
    const resized = new ResizeObserver(() => engine.wake())
    if (root.current) resized.observe(root.current)
    return () => { resized.disconnect(); engine.dispose(); particles.current = null }
  }, [])

  // One member: the caller stands level with its agent, so the line runs straight. Measured from
  // the top of the fan-out, so measuring again gives the same answer.
  useLayoutEffect(() => {
    const align = () => {
      const box = root.current?.getBoundingClientRect()
      const avatar = root.current?.querySelector('.chat-delegation [data-line-end]')?.getBoundingClientRect()
      const orb = core.current?.getBoundingClientRect()
      const top = caller.current?.getBoundingClientRect().top
      if (!single || !box || !avatar || !orb || top === undefined) { setLift(0); return }
      setLift(Math.round(avatar.top + avatar.height / 2 - box.top - (orb.top + orb.height / 2 - top)))
    }
    align()
    if (!single || !root.current) return
    const resized = new ResizeObserver(align)
    resized.observe(root.current)
    return () => resized.disconnect()
  }, [single])

  const key = states.join()
  useEffect(() => { particles.current?.setStates(states) }, [key])

  // Work going out: for a batch that arrived while the chat was open, all of it; afterwards, each
  // call that joins it. One already there when the chat opened is simply there.
  useEffect(() => {
    const ids = ordered.map((call) => call.id)
    if (seen.current === null) {
      seen.current = new Set(fresh ? [] : ids)
    }
    const known = seen.current
    const fresher = ids.flatMap((id, line) => known.has(id) ? [] : [line])
    for (const id of ids) known.add(id)
    if (fresher.length) { particles.current?.dispatch(fresher); setFlash(true) }
  }, [ordered.map((call) => call.id).join()])

  // All back while the chat is open: the caller flares once.
  useEffect(() => {
    if (over && !wasOver.current) { particles.current?.converge(); setFlash(true) }
    wasOver.current = over
  }, [over])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flash])

  const first = ordered[0]
  return <section ref={root} className="chat-delegation-group" data-single={single || undefined} aria-label={t('AgentProfiles.groupLabel', { count: ordered.length })}>
    <canvas ref={canvas} className="chat-delegation-lines" aria-hidden="true" />
    <div ref={caller} className="chat-delegation-caller" data-mood={mood} data-flash={flash || undefined} style={lift ? { marginTop: lift } : undefined}>
      <div ref={core} className="chat-delegation-core" aria-hidden="true">
        <svg className="chat-delegation-rings" viewBox="0 0 84 84"><circle className="ticks" cx="42" cy="42" r="40" /><circle className="outer" cx="42" cy="42" r="35" /><circle className="inner" cx="42" cy="42" r="29.5" /></svg>
        <span className="chat-delegation-orb" />
      </div>
      <span className="chat-delegation-caller-name">{t('AgentProfiles.mainConversation')}</span>
      {first && <time className="chat-delegation-caller-meta" dateTime={new Date(first.createdAt).toISOString()}>{t('AgentProfiles.dispatchedAt', { time: messageTime(first.createdAt) })}</time>}
      {!single && <span className="chat-delegation-caller-meta" role="status">{summary(ordered)}</span>}
    </div>
    <div className="chat-delegation-cards">
      {ordered.map((call) => <ChatDelegationCard key={call.id} call={call} fresh={fresh} />)}
    </div>
  </section>
}
