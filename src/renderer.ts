import { paintGhost, paintStudio } from './art'
import { deliveryPose, handoffQueue, type Handoff } from './handoff'
import { ambientMotion } from './ambient'
import { ghostMotion } from './ghost-motion'
import { paintWorkActivity, workActivities } from './work-activities'
import type { VisualState } from './state'
import { sceneSize } from './scene'
import { activityAnchor } from './layout'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState) {
  let state = initialState
  let elapsed = 0
  let frameDelta = 0
  const ghosts = ghostMotion()
  const activities = workActivities()
  activities.sync(state)
  const ambient = ambientMotion()
  ambient.sync(state)
  ghosts.sync(state.map(agent => agent.id))
  const background = document.createElement('canvas')
  let pixelRatio = 1
  let geometry = ''
  let active: { event: Handoff; seconds: number } | undefined
  const participant = (id: string) => state.find(a => a.id === id || a.specialist === id)
  const hasParticipants = (event: Handoff) => !!participant(event.source) && !!participant(event.target)
  const travelPose = (event: Handoff, seconds: number) => deliveryPose(seconds, participant(event.source)!, participant(event.target)!)
  const queue = handoffQueue()
  const bubble = document.createElement('div')
  bubble.className = 'task-bubble'
  bubble.setAttribute('role', 'status')
  bubble.hidden = true
  canvas.parentElement!.append(bubble)
  canvas.dataset.handoff = 'rest'
  function updateHandoff() {
    if (document.hidden) queue.clear()
    const next = queue.advance(performance.now(), motion.matches)
    if (next && next.event !== active?.event) {
      bubble.textContent = next.event.kind === 'result' ? `Result ${next.event.taskId} · ${participant(next.event.source)?.name} → Orchestrator — ${next.event.title}` : (next.event.context === 'rework' || next.event.target !== 'developer') ? `${next.event.context === 'rework' ? 'Rework' : next.event.target === 'reviewer' ? 'Review' : 'QA'} ${next.event.taskId}${next.event.sha ? ` @ ${next.event.sha.slice(0, 7)}` : ''} — ${next.event.title}` : `${next.event.taskId} — ${next.event.title}`
      bubble.dataset.target = next.event.target
      canvas.dataset.target = next.event.target
    }
    if (next && !hasParticipants(next.event)) { queue.clear(); active = undefined; bubble.hidden = true; return }
    active = next
    const phase = active ? (motion.matches ? 'bubble' : travelPose(active.event, active.seconds).phase) : 'rest'
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
    const key = `${size.width}:${size.height}:${pixelRatio}:${state.map(a => `${a.col},${a.row}`).join(';')}`
    canvas.parentElement!.style.width = `${size.width}px`
    if (key !== geometry) {
      geometry = key
      canvas.width = Math.ceil(size.width * pixelRatio)
      canvas.height = Math.ceil(size.height * pixelRatio)
      background.width = canvas.width; background.height = canvas.height
      const staticContext = background.getContext('2d')!
      staticContext.scale(pixelRatio / 3, pixelRatio / 3)
      paintStudio(staticContext, state)
    }
    bubble.style.setProperty('--bubble-top', `${14 / size.height * 100}%`)
    bubble.style.setProperty('--qa-bubble-top', `${92 / size.height * 100}%`)
  }
  resize()
  window.addEventListener('resize', resize)
  const stop = startGameLoop(canvas, {
    update: dt => { frameDelta = dt; elapsed += dt; updateHandoff() },
    render: ctx => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(background, 0, 0)
      ctx.save(); ctx.scale(pixelRatio / 3, pixelRatio / 3)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const travel = active && !motion.matches ? travelPose(active.event, active.seconds) : undefined
      const courier = active ? participant(active.event.source)?.id : undefined
      const recipient = active ? participant(active.event.target)?.id : undefined
      for (const agent of state) {
        const visitor = courier === agent.id ? travel : undefined
        const offset = ambient.sample(agent.id, elapsed, frameDelta, agent.activity === 'idle', motion.matches, !!active)
        const moving = visitor && visitor.phase !== 'bubble'
        const pose = ghosts.sample(agent.id, elapsed, frameDelta, motion.matches, moving ? visitor.dx : offset.dx, moving ? visitor.dy : offset.dy)
        const x = (visitor?.x ?? agent.col * 16 + 8) + offset.x
        const y = ((visitor?.y ?? agent.row * 16 + 8) + offset.y) + 44
        paintGhost(ctx, agent, x, y, pose)
        const interrupted = !!active && (courier === agent.id || recipient === agent.id)
        const activity = activities.sample(agent.id, frameDelta, motion.matches, interrupted || Math.hypot(offset.x, offset.y) > 0.5)
        if (activity) paintWorkActivity(ctx, activityAnchor(agent), activity, 3)
        if (courier === agent.id && (motion.matches || travel?.carrying)) {
          // Pixel document is attached to the courier, never ambient movement.
          ctx.fillStyle = '#596575'
          ctx.fillRect((x + 8) * 3, (y - 18 + pose.lift) * 3, 24, 30)
          ctx.fillStyle = '#fff4d6'
          ctx.fillRect((x + 9) * 3, (y - 17 + pose.lift) * 3, 18, 24)
          ctx.fillStyle = '#8794a0'
          ctx.fillRect((x + 10) * 3, (y - 14 + pose.lift) * 3, 12, 3)
          ctx.fillRect((x + 10) * 3, (y - 11 + pose.lift) * 3, 9, 3)
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
  return { setState: (next: VisualState) => { state = next; activities.sync(state); ambient.sync(state); ghosts.sync(state.map(agent => agent.id)); resize(); if (active && !hasParticipants(active.event)) { queue.clear(); active = undefined; bubble.hidden = true } }, handoff: (event: Handoff) => { if (!document.hidden && hasParticipants(event)) queue.push(event, performance.now()) }, destroy: () => { stop(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility); bubble.remove() } }
}
