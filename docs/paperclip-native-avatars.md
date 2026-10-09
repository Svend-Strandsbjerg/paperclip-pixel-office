# Paperclip-native appearance (DEV-115 / DEV-116)

Historical implementation note: the human sprite rendering described below is superseded by [native ghost avatars](paperclip-ghost-avatars.md).

This supersedes the appearance decision in `identity-art-direction.md`. The office is a pixel interpretation of Paperclip appearance, not an exact reproduction of its PNG avatar.

## Installed-instance investigation, 2026-10-09

Read-only requests to the configured instance confirmed the following agent-list values:

| Permanent desk role | schemaVersion | characterVersion | paletteId |
| --- | --- | --- | --- |
| Orchestrator | 1 | cap-v1 | orchid-peach |
| Developer | 1 | cap-v1 | tangerine-cobalt |
| Browser QA | 1 | cap-v1 | solar-flare |
| Reviewer | 1 | cap-v1 | violet-ember |

Each response supplies `avatarUrl` as `/api/agent-avatars/cap-v1/<palette>/rest.png?size=512&scale=1`. Repeated agent-list reads were stable. Authenticated list reads return 200; anonymous reads return 401. Only projected appearance/name/role were printed during investigation. No private configuration, credential or internal ID is included here.

The **actually served** implementation was inspected, not substituted with current upstream source: `/assets/createLucideIcon-BeRqU-eU.js` contains the strict schema and normalization helpers; `/assets/AgentAvatar-BQcATpuj.js` contains the image component. Installed schema allows exactly schema 1, character `cap-v1`, and the 17 palette identifiers in `src/identity.ts`. The client defaults invalid appearance via an agent-ID hash, generates new choices using crypto randomness, builds the avatar URL from the tuple, and requests a 2x srcset. It maps running to working, error to confused, paused/terminated/pending approval to rest, and other statuses to idle. These are static pose images, not a directional walk-cycle contract. The office deliberately does not reproduce the client’s ID fallback and does not generate random appearance.

Limitations: the installed server source/database are outside this execution filesystem. All four `/api/agents/<id>/configuration` reads return 403 for this agent, so raw persisted configuration could not be independently inspected; authoritative hydrated agent responses were inspected instead. No permission escalation, database access or Paperclip modification was attempted. This does not establish whether an individual hydrated appearance originated from persisted data or Paperclip’s own defaulting. The office treats the API's validated appearance as authoritative.

Actual anonymous endpoint probes:

| Request under `/api/agent-avatars/cap-v1/orchid-peach/` | Result |
| --- | --- |
| `rest.png?size=512&scale=1` | 200 PNG, 512×512, 25,454 bytes |
| `rest.png?size=32&scale=1` | 200 PNG, 32×32, 2,049 bytes |
| `rest.png?size=32&scale=2` | 200 PNG, 64×64, 3,995 bytes |
| `working.png?size=32&scale=1` | 200, distinct PNG bytes |
| `idle.png?size=32&scale=1` | 200, same bytes as rest in this probe |
| `walking.png?size=32&scale=1` | 400 |
| rest with size 31 or scale 3 | 400 |
| unknown character version or palette | 400 |

All 17 allowlisted palettes were also requested anonymously at 32px: all returned HTTP 200 PNG with 17 distinct byte hashes.

Successful images advertise `public, max-age=31536000, immutable`. Repeated anonymous and authenticated 32px rest requests produced identical SHA-256 `03c6a6e8da54dcdec70562f782e7fb50a55f0e06168d275a5345d4b7ae5b2727`; 512px rest hash was `ba3a41d3663b3a8631dd44ff143a2bc0e1869ae5f94236e990c4335e0dd7caa2`. This demonstrates observed determinism, not a promise that future server releases never change artwork.

## Mapping and alternatives

Chosen: validate and project `{schemaVersion, characterVersion, paletteId}` on the server and validate again in the browser. A shared sprite function maps this tuple to the **whole character**: primary color controls head/hair and torso, secondary color controls face and trousers, with constant dark shoes. No live skin, hair or clothing color comes from role, name, email or ID. Identical appearances produce identical characters at any desk; all four current palettes produce distinct characters. Names and permanent desk labels still distinguish agents sharing an appearance.

The 17 color pairs are the existing original office interpretations, not sampled or copied avatar colors. Reusing the licensed 16×24 directional sprite templates preserves every walk/type/read frame, anchor, timing, furniture occlusion, handoff/rework/task bubble, route and reduced-motion behavior. Roster portraits use the same sprite function as the canvas. Desk/rug/journal accents and roster borders use the same normalized appearance. Geometry, desk ownership and workflow routing are untouched.

Alternatives evaluated against actual behavior:

- Direct native PNG: exact visual fidelity, but a static square image supplies no walking directions and would change the existing character footprint. It also needs a safe asset bridge and cache/error path.
- Downsampling/transformation: requesting 32px avoids shrinking 512px at runtime, but does not create the missing walk/typing frames or preserve the existing anchor.
- Compositing native heads onto local bodies: introduces alignment work across directions and poses, inconsistent animation, and a new artwork licensing dependency.
- Exact PNG roster plus mapped canvas: two visual identities; rejected in favor of one sprite source.
- Metadata mapping and template reuse (chosen): bounded, deterministic, no runtime image fetching, external CDN or generation service. Clearly described as an office interpretation.

## Fallback and availability

Missing/null/malformed/array/invalid-type appearance, extra fields, unsupported schema/version/palette and inherited properties fail closed to the deterministic existing local role sprite. The visible roster text says **Local fallback · appearance unavailable**, not merely a tooltip. Unknown future fields do not silently masquerade as a supported Paperclip appearance. Older office payloads without identities also use this fallback. Demo has no fabricated Paperclip tuple and explicitly says **Local demo appearance**.

On total upstream failure, existing last-successful state is retained, with **DISCONNECTED** and “Showing the last received activity and appearance.” Before any successful state, local fallback is shown. A successful response that lacks valid appearance switches to local fallback immediately; recovery restores the authoritative character. No backend mutation or editor is added.

## Caching, security, extension

Normal polling projects four tiny tuples. Sprite memoization keys are `schemaVersion:characterVersion:paletteId` (or four local role keys), bounded by the supported 17 appearances plus four fallbacks. No key contains credentials or upstream private IDs. Portraits are regenerated only when their tuple changes; sprite generation and image creation are not repeated every poll. Cache entries are populated only after generation succeeds; portrait identity is recorded only after encoding succeeds. There are no network asset failures to cache. Existing polling errors preserve state.

Only bounded plain-text name/role and the validated tuple reach the browser. Upstream avatar URLs, raw responses, adapter configuration, secret refs and auth headers are not forwarded. Existing server GET-only integration and exact persistent role-ID matching remain intact. Browser labels use textContent; no arbitrary palette strings, URLs or colors reach rendering.

For a future schema/character version, investigate the installed contract and rights, add an explicit validator and renderer mapping, and test its geometry, animation and cache keys. Until then it uses disclosed local fallback. Useful future authoritative fields would be a versioned pixel palette, directional animation atlas/frame rectangles, foot anchor, frame durations, supported states, asset checksum and license identifier. Do not infer these from names or IDs.

## Provenance

No new artwork files or third-party assets were imported. Original office color interpretations remain in `src/identity.ts`; existing Pixel Agents code-defined templates and their MIT notice remain governed by `THIRD_PARTY.md`. Installed minified code and PNGs were inspected only and are not redistributed. No image-generation service was used.
