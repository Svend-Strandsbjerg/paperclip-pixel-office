# Native Paperclip ghosts (DEV-124 / DEV-125)

This supersedes the human sprite interpretation in `paperclip-native-avatars.md`.

The existing validated `appearance.schemaVersion`, `characterVersion`, and `paletteId` are the source of truth. The renderer and roster request the same native Paperclip `rest.png` image, through `/api/office-avatar/<characterVersion>/<paletteId>.png`. The server requests the installed Paperclip avatar endpoint at 64px. It does not recolor or reconstruct the ghost, use role/name/ID to choose artwork, or forward arbitrary `avatarUrl` values. Agent `avatarUrl` values were verified to correspond to this tuple-derived native route.

The four observed appearances are Orchestrator: orchid-peach, Developer: tangerine-cobalt, Browser QA: solar-flare, Reviewer: violet-ember. All are schema 1 / cap-v1. Any supported palette resolves through the same path. A replacement/new agent assigned to an existing permanent desk via `PAPERCLIP_AGENT_ROLES` requires configuration only; its appearance is picked up on polling. The existing four-desk capacity is unchanged; adding rooms/desks is outside this avatar-only change.

Ghosts hover in front of existing computers with a small ground shadow. The room painting, furniture, desk ownership, labels, task routes, handoff timing and reduced-motion logic remain unchanged. Static native rest artwork replaces directional human frames, including during existing handoff travel. No new animation system is added.

Demo/missing/unsupported appearance uses an explicitly labeled neutral local ghost. While native images load or fail, a neutral ghost remains visible. Failed loads retry after 30 seconds (roster on its next state update); successful images are reused. Server cache is bounded by the 17 supported tuples. Requests use the configured Paperclip origin, no auth headers, no redirects, a timeout, PNG validation and a size bound; errors are not cached. No external artwork files are committed.

Verification route: `/` with the existing live `.env` setup from `.env.example`; alternatively `OFFICE_MODE=demo npm start` after `npm run build`. No browser login is required. Live verification observed all four native identities above. Compare room geometry and decoration with main, inspect canvas ghosts and matching square roster portraits, then test appearance changes and asset outage/recovery. Existing `tests/browser/production.spec.ts` covers live polling/handoffs; its mock asset endpoint supplies a tiny test PNG, so native-art visual verification needs the configured live instance.
