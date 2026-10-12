import { activityAnchor } from './layout'
import { paintWorkItem, workItems } from './work-items'
import { paintGhost, paintStudio } from './art'
import { deliveryPose, handoffQueue, type Handoff } from './handoff'
import { ambientMotion } from './ambient'
import { ghostMotion } from './ghost-motion'
import { ACTIVITY_PRESENTATION, paintWorkActivity, workActivities, type ActivityProfile } from './work-activities'
import type { VisualState } from './state'
import { sceneSize } from './scene'
import { studioViewport } from './studio-viewport'
import { officeActivities, paintCarriedItem } from './office-activities'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState, onActivity?: (id: string, profile: ActivityProfile) => void) {
  let state = initialState
  let elapsed = 0
  let frameDelta = 0
  const ghosts = ghostMotion()
  const items = workItems()
  const displayedProfiles = new Map<string, ActivityProfile>()
  let placedEvent: Handoff | undefined
  const activities = workActivities()
  activities.sync(state)
  const excursions = officeActivities()
  excursions.sync(state)
  const ambient = ambientMotion()
  ambient.sync(state)
  ghosts.sync(state.map(agent => agent.id))
  const background = document.createElement('canvas')
  const scene = canvas.parentElement!
  const viewport = scene.parentElement!
  let pixelRatio = 1
  let renderScale = 1
  let geometry = ''
  let handoffApproach: { x: number; y: number }[] = []
  let active: { event: Handoff; seconds: number } | undefined
  const participant = (id: string) => state.find(a => a.id === id || a.specialist === id)
  const hasParticipants = (event: Handoff) => !!participant(event.source) && !!participant(event.target)
  const travelPose = (event: Handoff, seconds: number) => deliveryPose(seconds, participant(event.source)!, participant(event.target)!, handoffApproach)
  const queue = handoffQueue()
  const bubble = document.createElement('div')
  bubble.className = 'task-bubble'
  bubble.setAttribute('role', 'status')
  bubble.hidden = true
  canvas.parentElement!.parentElement!.before(bubble)
  canvas.dataset.handoff = 'rest'
  function updateHandoff() {
    if (document.hidden) queue.clear()
    const next = queue.advance(performance.now(), motion.matches)
    if (next && next.event !== active?.event) {
      const source = participant(next.event.source)
      if (source) {
        if (next.event.kind === 'result') items.pickup(source.id)
        handoffApproach = excursions.returnPath(source.id)
      }
      bubble.textContent = next.event.kind === 'result' ? `Result ${next.event.taskId} · ${participant(next.event.source)?.name} → Orchestrator — ${next.event.title}` : (next.event.context === 'rework' || next.event.target !== 'developer') ? `${next.event.context === 'rework' ? 'Rework' : next.event.target === 'reviewer' ? 'Review' : 'QA'} ${next.event.taskId}${next.event.sha ? ` @ ${next.event.sha.slice(0, 7)}` : ''} — ${next.event.title}` : `${next.event.taskId} — ${next.event.title}`
      bubble.dataset.target = next.event.target
      canvas.dataset.target = next.event.target
    }
    if (next && !hasParticipants(next.event)) { queue.clear(); active = undefined; bubble.hidden = true; return }
    active = next
    const phase = active ? (motion.matches ? 'bubble' : travelPose(active.event, active.seconds).phase) : 'rest'
    if (active && phase === 'bubble' && placedEvent !== active.event) {
      items.place(participant(active.event.target)!.id, active.event.taskId, elapsed)
      placedEvent = active.event
    }
    if (canvas.dataset.handoff !== phase) canvas.dataset.handoff = phase
    const hidden = phase !== 'bubble'
    if (bubble.hidden !== hidden) bubble.hidden = hidden
  }
  const onVisibility = () => { if (document.hidden) { queue.clear(); updateHandoff() } }
  document.addEventListener('visibilitychange', onVisibility)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  function resize() {
    const size = sceneSize(state)
    pixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const display = studioViewport(size, viewport.clientWidth, pixelRatio)
    renderScale = display.scale * display.effectivePixelRatio
    const key = `${display.width}:${display.height}:${pixelRatio}:${state.map(a => `${a.col},${a.row}`).join(';')}`
    scene.style.width = `${display.width}px`
    scene.style.height = `${display.height}px`
    if (key !== geometry) {
      geometry = key
      canvas.width = display.bufferWidth
      canvas.height = display.bufferHeight
      background.width = canvas.width; background.height = canvas.height
      const staticContext = background.getContext('2d')!
      staticContext.scale(renderScale / 3, renderScale / 3)
      paintStudio(staticContext, state)
    }
  }
  resize()
  window.addEventListener('resize', resize)
  const observer = new ResizeObserver(resize)
  observer.observe(viewport)
  const stop = startGameLoop(canvas, {
    update: dt => { frameDelta = dt; elapsed += dt; updateHandoff() },
    render: ctx => {
      if (pixelRatio !== Math.max(1, window.devicePixelRatio || 1)) resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(background, 0, 0)
      ctx.save(); ctx.scale(renderScale / 3, renderScale / 3)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const travel = active && !motion.matches ? travelPose(active.event, active.seconds) : undefined
      const courier = active ? participant(active.event.source)?.id : undefined
      const recipient = active ? participant(active.event.target)?.id : undefined
      for (const agent of state) {
        const visitor = courier === agent.id ? travel : undefined
        const interrupted = !!active && (courier === agent.id || recipient === agent.id)
        const excursion = excursions.sample(agent.id, document.hidden ? 0 : frameDelta, motion.matches || courier === agent.id, interrupted)
        const offset = ambient.sample(agent.id, elapsed, frameDelta, agent.activity === 'idle' && excursion.phase === 'desk', motion.matches, !!active)
        const moving = visitor && visitor.phase !== 'bubble'
        const pose = { ...ghosts.sample(agent.id, elapsed, frameDelta, motion.matches, moving ? visitor.dx : excursion.dx || offset.dx, moving ? visitor.dy : excursion.dy || offset.dy) }
        const x = (visitor?.x ?? excursion.x) + offset.x
        const y = (visitor ? visitor.y + 44 : excursion.y) + offset.y
        if (agent.activity === 'working' && !motion.matches && !active && (excursion.phase === 'desk' || excursion.phase === 'pause')) {
          pose.pitch += Math.sin(elapsed * 2.4) * 0.3
          pose.lift += Math.sin(elapsed * 4.8) * 0.7
        }
        const atDesk = excursion.phase === 'desk' && !interrupted
        const item = items.sample(agent.id, agent.activity === 'working', atDesk, elapsed)
        const activity = activities.sample(agent.id, frameDelta, motion.matches,
          !atDesk || (!!item && item.phase === 'waiting'))
        if (activity && displayedProfiles.get(agent.id) !== activity.profile) {
          displayedProfiles.set(agent.id, activity.profile)
          onActivity?.(agent.id, activity.profile)
        }
        if (agent.activity !== 'working') displayedProfiles.delete(agent.id)
        paintGhost(ctx, agent, x, y, pose, activity ? ACTIVITY_PRESENTATION[activity.profile].accessory : undefined)
        if (!interrupted) paintCarriedItem(ctx, excursion, pose.lift)
        const anchor = activityAnchor(agent)
        if (item) paintWorkItem(ctx, anchor, item.phase === 'processing')
        if (activity) paintWorkActivity(ctx, anchor, activity, 3)
        if (courier === agent.id && (motion.matches ? placedEvent !== active?.event : travel?.phase === 'outbound')) {
          // The same card shape moves from hand to the workstation, or from
          // the completed work anchor into the returning specialist's hand.
          const hand = { x: x - 26, y: y + 11 + pose.lift }
          const target = activityAnchor(participant(active!.event.target)!)
          const pickup = active!.event.kind === 'result' ? Math.max(0, 1 - active!.seconds / 0.5) : 0
          const placement = motion.matches ? 1 : Math.max(0, Math.min(1, (active!.seconds - 3.5) / 0.5))
          const card = pickup > 0 ? { x: hand.x + (anchor.x - hand.x) * pickup, y: hand.y + (anchor.y - hand.y) * pickup }
            : { x: hand.x + (target.x - hand.x) * placement, y: hand.y + (target.y - hand.y) * placement }
          paintWorkItem(ctx, card, active!.event.kind === 'result')
        }
      }
      for (const agent of state) {
        const x = (agent.col * 16 + 8) * 3
        const y = (agent.row * 16 + 8) * 3
        ctx.fillStyle = agent.activity === 'working' ? '#c7f38f' : '#d6dfda'
        // State light is visible even when motion is disabled.
        ctx.fillRect(x + 25, y + 43, 9, 6)
      }
      ctx.restore()
    },
  })
  return { setState: (next: VisualState) => { state = next; items.sync(state.map(a => a.id)); for (const id of displayedProfiles.keys()) if (!state.some(a => a.id === id)) displayedProfiles.delete(id); activities.sync(state); excursions.sync(state); ambient.sync(state); ghosts.sync(state.map(agent => agent.id)); resize(); if (active && !hasParticipants(active.event)) { queue.clear(); active = undefined; bubble.hidden = true } }, handoff: (event: Handoff) => { if (!document.hidden && hasParticipants(event)) queue.push(event, performance.now()) }, destroy: () => { stop(); observer.disconnect(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility); bubble.remove() } }
}
