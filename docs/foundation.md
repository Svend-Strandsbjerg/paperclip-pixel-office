# Foundation decision — 2026-10-06

Decision recorded **before importing third-party implementation or assets**.

Use a bounded extraction of [rolandal/pixel-agents-standalone](https://github.com/rolandal/pixel-agents-standalone), commit `a8c73c091fa67b908594295af39c038db3ba92f0`. Its original upstream is [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (the former `pablodelucca/pixel-agents` URL redirects there). The standalone fork is the exact source of our vendored files; do not track its moving main branch.

## Evaluation

Reviewed each repository's README and file tree, plus the selected engine, sprite definitions, layout serializer, and representative rendering/movement modules in alternatives. This is a suitability review, not a full security audit. Links below identify canonical repository locations; commits pin the evaluated versions.

| Candidate / revision | Rendering, maps, characters, state and movement | Layout, bubbles, boundary and suitability |
| --- | --- | --- |
| [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office/tree/291e7608aa3beb614aca80fe86077ef8c0cbc21d) | React/DOM isometric sprite images; room spots and waypoint graph; lifecycle with working, breaks and exit; waypoint movement. | Assigned desks and speech/effect components; UI includes socket/chat/theme dependencies. MIT code, but custom/generated image provenance would need further investigation separately. Four fixed roles possible, but more lifecycle and image coupling to remove. Not selected. |
| [rolandal/pixel-agents-standalone](https://github.com/rolandal/pixel-agents-standalone/tree/a8c73c091fa67b908594295af39c038db3ba92f0) | Canvas 2D, 16px tiles, sprite cache, directional idle/walk/type frames, BFS pathfinding, separately defined engine/state. | Furniture catalog, desks/seats, bubble sprites, serializable layouts. MIT code; embedded procedural fallback sprites can run without paid PNG tilesets. Pure rendering functions accept supplied state and are easy to bound to four roles. Selected. |
| [percheniy/office-for-claude-agents](https://github.com/percheniy/office-for-claude-agents/tree/8fc8759326335ac95b02b4da88164fc3d0054a3b) | Expanded Pixel Agents Canvas engine, manifests, character packs and idle activities. | Rich layouts, bubbles, session inspection and GitHub task tracking. Mixed upstream MIT and separately marked noncommercial additions; purchased LimeZu-derived assets require separate rights analysis. More integration and licensing complexity than this foundation needs. Not selected. |
| [hootbu/pixel-agents](https://github.com/hootbu/pixel-agents/tree/a6c4d85df1266ed43fa7d0ef70525475248fafc3) | Pixel Agents Canvas/tile architecture; BFS and idle/walk/type states, directional sprites. | Seat management, mood bubbles, editor, pets and achievements; VS Code host boundary. MIT code, optional third-party tilesets separate. Adaptable, but standalone fork provides a simpler extraction point. Not selected. |
| [piraminet/pixel-office](https://github.com/piraminet/pixel-office/tree/ef9e217b666bab48f4b9f131f70d5c5a6efeb2eb) | Canvas renderer in a large HTML file; collision grid, A* movement and character animation. | JSON rooms/agents, speech bubbles, dashboard and command API mixed with viewer. No root code license found in tree/API metadata. MetroCity character assets have their own license; paid Donarg background excluded upstream. No demonstrated code reuse grant: rejected. |
| [gigantsc/pixel-office-openclaw](https://github.com/gigantsc/pixel-office-openclaw/tree/ef9e217b666bab48f4b9f131f70d5c5a6efeb2eb) | Fork of piraminet at the same revision; same Canvas/grid/animation/pathfinding implementation. | Same layout/bubble and control-plane coupling, same absent code license. No reason to select over canonical source. Rejected. |
| [KbWen/agent-virtual-office](https://github.com/KbWen/agent-virtual-office/tree/1816cfc8313a2f7ba4b2c8990ec25bb94164ac7f) | React SVG office, code-defined characters/furniture, behavior and waypoint movement systems; no Canvas tile renderer. | Role-specific desks, behavior bubbles, Zustand state; top-level office starts inference, ambient life and workflow handoffs. MIT code and code-defined graphics, but extracting four fixed roles requires pruning a larger behavioral surface. Technically viable alternative, not selected. |

## Code and asset review (separate decisions)

Code: the selected revision's [LICENSE](https://github.com/rolandal/pixel-agents-standalone/blob/a8c73c091fa67b908594295af39c038db3ba92f0/LICENSE) is MIT, copyright 2025 Pablo De Lucca and 2026 Roland Ligtenberg. Preserve it in `third_party/pixel-agents-LICENSE.txt` and ship it in the built application.

Assets: inspect `webview-ui/src/office/sprites/spriteData.ts` separately from `webview-ui/public`. The former defines fallback pixel matrices and procedural furniture directly in TypeScript, with no imported image data or separately stated asset license. These embedded drawings are part of the MIT source being adapted; preserve the same notice. Only those embedded definitions will be used. This is not an assertion that all upstream artwork is MIT.

The selected README explicitly identifies the optional Donarg Office Interior Tileset as purchased separately. **Do not import it or any extracted furniture PNGs.** Also exclude upstream character PNGs, walls PNGs, screenshots, fonts and other public assets: their presence in an MIT repository is not sufficient asset-license verification. No external image asset is needed by the chosen fallback renderer.

For the rejected piraminet family, the separately checked [MetroCity creator page](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) lists CC0; that does not license the surrounding application code. No MetroCity files will be reused here.

## Intended reuse, recorded before import

Vendor only the selected fork's Canvas rendering core and its required TypeScript dependencies under `src/vendor/pixel-agents/`: tile/scene rendering, sprite caching, code-defined sprite matrices, frame selection, game loop, color helpers, types/constants and required layout helpers. Preserve attribution and document exact files/changes in `THIRD_PARTY.md`. Prune editor rendering, spawning effects and autonomous movement where practical; do not import React UI, session watchers, server, sockets, agent orchestration, editor UI or third-party image packs.

Build a small browser shell and provider adapter around this renderer. Four immutable role definitions supply palette, seat and label; demo snapshots supply only idle/working activity. The adapter owns mapping; the renderer sees visual state only. Keep fixed desks in both states rather than running upstream random wandering. Reuse upstream sprites, depth ordering and animation frames rather than inventing a new office engine. Movement/pathfinding is evaluated but not required by this POC.

No custom-foundation fallback is needed because this bounded reuse is suitable.
