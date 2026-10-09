# Working ghost activities

`work-activities.ts` owns deterministic identity/epoch selection, lifecycle state and
six graphical profiles. The controller retains one entry per working agent; poll
updates preserve it and idle/removal clears it. Each 18-second cycle fades in/out
and advances to a different profile. Handoffs pause both participants immediately;
resumption fades back in at the saved cycle position. Required positioning settles
before effects resume. Reduced motion keeps one static profile without cycling.

The renderer passes the current workstation position as an anchor. The painter
only knows local coordinates and scale: it imports no room, furniture, identity or
provider code. It uses the existing frame clock and bounded canvas primitives,
without timers, image allocations, DOM reads or network calls. Native avatar art,
hover, directional movement and room geometry are unchanged.

## QA setup

Run `npm ci && npm run build`, then `OFFICE_MODE=demo npm run start` and visit
`http://127.0.0.1:3000`. No login or Paperclip writes are needed. Choose **All
working** for concurrent activities and observe at least 40 seconds to see cycles;
**All idle** removes effects. Use the existing demo handoff controls to interrupt
working participants, and check that effects resume
only after the route completes. Result courier routes have renderer integration
coverage; the roster/pipeline browser fixtures can exercise live result events. Compare desktop and 390px-wide layouts. Enable
`prefers-reduced-motion: reduce` to verify static activity graphics while functional
handoff bubbles remain visible; switch back to restore decorative motion.

`tests/browser/office.spec.ts` covers demo controls, handoffs and reduced motion.
`tests/browser/roster.spec.ts` provides intercepted office-state fixtures for newly
added agents and a 40-agent roster; mark fixture agents working to exercise the
shared activity pool. Browser QA should check effects stay small and below the
recognizable native ghosts, remain readable with several agents, and do not obscure
labels. These browser specs were not run as part of implementation validation.

Automated unit/integration coverage: `tests/work-activities.test.ts` and
`tests/ghost-renderer.test.ts`, plus existing hover, ambient and handoff tests.
