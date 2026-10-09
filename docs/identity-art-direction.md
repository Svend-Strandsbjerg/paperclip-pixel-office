# Paperclip identity and studio art direction (DEV-75)

Appearance behavior below is historical; see [DEV-115 installed investigation and replacement mapping](paperclip-native-avatars.md).

## Source and scope

The instance at the supplied `PAPERCLIP_API_URL` refused connections on 2026-10-07. No actual company agent response could be inspected. Instead, the production HTTP/browser fixture uses the current public Paperclip response contract, verified against:

- [Agents API](https://github.com/paperclipai/paperclip-docs/blob/main/docs/reference/api/agents.md), documentation marked v2026.1005.0.
- [Appearance schema and response hydration](https://github.com/paperclipai/paperclip/blob/378e6d95e1fbd52298f56ffcd5e261f80965b6b8/packages/shared/src/agent-appearance.ts).
- [Avatar GET route](https://github.com/paperclipai/paperclip/blob/378e6d95e1fbd52298f56ffcd5e261f80965b6b8/server/src/routes/agent-avatars.ts).

This verifies response-shape compatibility, not the four deployed agents' current palettes. After connectivity is restored, the operator should run the existing live configuration and compare each roster name/palette with Paperclip. No configuration or deployment changes are included.

| Upstream field | Use |
| --- | --- |
| `id` | Server-only exact match against existing four-role configuration; never sent to browser. |
| `name`, `role` | Bounded plain text below permanent role labels. |
| `appearance` | `{schemaVersion: 1, characterVersion: 'cap-v1', paletteId}`; only recognized persisted palettes are projected. |
| `avatarUrl` | Present in the documented API, derived from appearance (e.g. `/api/agent-avatars/cap-v1/bubblegum-sky/rest.png?size=512&scale=1`). Deliberately not forwarded/fetched. |
| `status` | Existing `running` → working, other lifecycle values → idle mapping. No new orchestration inference. |
| other state/configuration | Excluded; no generic field spreading from agent data. |

The browser receives `identities[officeRole] = {name, role, paletteId?}` alongside the existing snapshot/tasks. Missing or unsupported appearance retains a deterministic local role palette; the roster tooltip says “Local role appearance.” Missing names/roles use the desk role label. Missing/duplicate mapped agents still fail the whole snapshot, retaining last valid browser state during outages. Older responses without `identities` remain supported and show “Identity unavailable.”

## Rendering decision

| Option | Assessment |
| --- | --- |
| Direct avatar rendering | Exact Paperclip character image, but a single PNG does not supply directional walking/typing frames. A safe same-origin image bridge would add fetching/cache/error handling. |
| Appearance-driven sprites (chosen) | Persisted `paletteId` controls clothing, matching roster portrait and desk accent. Works with all existing walk/type/read directions. No asset requests or new server route. |
| Hybrid | An exact avatar portrait plus themed animated sprite would add a second visual style and image transport; unnecessary for this scoped upgrade. |

Colors in `src/identity.ts` are original office interpretations of the 17 named palettes, not copied Paperclip artwork or exact avatar pixel colors. Character shapes and role-specific hair/skin colors remain the existing licensed Pixel Agents templates. No claim is made that these are exact Paperclip avatars. Shared palettes still have distinguishable role hair/skin combinations, names and desk positions. No randomized choices, ID hashing or per-poll palette allocation. Upstream appearance changes intentionally update the next successful poll. Demo fixes four different palette identities and stops live polling as before.

A future exact-avatar/hybrid effort could use the provided URL through an allowlisted same-origin read-only image bridge, with a separate asset-rights review. A native cap-v1 walk cycle would need an explicit directional animation contract; it is not generated or approximated from a PNG here.

## Art references and rights

Two references were evaluated on 2026-10-07:

1. [Pixel Agents canonical project](https://github.com/pixel-agents-hq/pixel-agents): compact top-down room, readable desk/character layering and integer-grid animation. The existing pinned extraction remains the only reused art/code, with its code and embedded-art MIT review recorded separately in `THIRD_PARTY.md`. No new upstream assets or source were imported.
2. [Kenney Tiny Town canonical asset page](https://kenney.nl/assets/tiny-town): coherent tiles and clear warm/cool separation are useful direction; town/exterior assets do not fit this office. The page identifies CC0 assets, but no download, code, art, tracing or extraction was used, so there is no new reuse/license dependency.

The new plank floor, skyline windows, bordered desk rugs, aisle runner, lamps, notebooks and mugs are original integer-grid canvas drawings in `src/art.ts`. Navy architecture frames warm wood and restrained persisted-identity accents. Desk coordinates, z sorting and open handoff aisles remain intact. Roster portraits reuse the same sprite generation as characters; names wrap on mobile. No new bitmap packs, fonts, dependencies or theme framework.

## Verification

See `docs/verification-dev75.md` for final results. Controlled fixtures traverse real production Node HTTP → allowlisted identity projection → browser parsing → animated canvas and portrait rendering. Tests cover all palette identifiers, malformed/future appearance fallback, unique/missing ID mapping, reorder/reload/poll stability, read-only requests and exclusion of credentials/internal IDs. Existing browser checks retain handoffs, idle/working, reduced motion, 320/390px layout, startup, issue-read failure and outage/recovery coverage.
