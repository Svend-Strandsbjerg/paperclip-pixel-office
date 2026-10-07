# Third-party inventory

The pre-import decision is in [docs/foundation.md](docs/foundation.md), committed before implementation as `6628ab1`.

## Pixel Agents source and embedded drawings

- Exact source: [rolandal/pixel-agents-standalone](https://github.com/rolandal/pixel-agents-standalone/tree/a8c73c091fa67b908594295af39c038db3ba92f0), revision `a8c73c091fa67b908594295af39c038db3ba92f0`.
- Canonical original upstream: [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents), formerly `pablodelucca/pixel-agents`.
- License: MIT, copyright (c) 2025 Pablo De Lucca and (c) 2026 Roland Ligtenberg. Full text is preserved in [third_party/pixel-agents-LICENSE.txt](third_party/pixel-agents-LICENSE.txt). The application includes that full notice in its Credits & license disclosure, including production builds.
- Path mapping: upstream `webview-ui/src/<path>` → local `src/vendor/pixel-agents/<path>`.

| Path | Adaptation |
| --- | --- |
| `constants.ts` | Retain only constants used by the extracted types/renderer/loop. |
| `office/types.ts` | Original type definitions, with attribution header. |
| `office/colorize.ts` | Original color helpers, with attribution header. |
| `office/sprites/spriteData.ts` | Original procedural furniture, pixel matrices, palette/frame resolution and cache, with attribution header. No PNG templates are loaded. |
| `office/sprites/spriteCache.ts` | Original Canvas sprite/outline cache, with attribution header. |
| `office/engine/gameLoop.ts` | Original bounded-delta animation loop and cleanup, with attribution header. |
| `office/engine/characters.ts` | Extract creation and frame selection. Remove autonomous movement/pathfinding and random wander limits; narrow unused tool classification to Read. |
| `office/engine/renderer.ts` | Extract tile rendering and depth-sorted furniture/characters. Use a two-tone solid floor fallback. Remove editor, frame orchestration, bubbles, image tile loading and spawn/despawn effects. |

Asset review is separate from the code decision: the reused character/furniture drawings are embedded TypeScript definitions in `spriteData.ts`, governed by the source license, with no separate asset terms found for those definitions. No third-party raster images, fonts, audio, PNG character templates, commercial tilesets, extracted tileset pieces or screenshots are included. The procedural window/rug decoration and application CSS are new code. The MetroCity and Donarg packs discussed in the evaluation are **not** dependencies or included assets.

To update the extraction, review the upstream diff and code/asset rights first, then update the pinned revision and this inventory. Do not replace the directory with an entire upstream checkout.

## Package dependencies

There are no runtime package dependencies. Development tools (Vite, TypeScript, tsx, Playwright, Node type definitions) and their transitive dependencies are pinned in `package-lock.json`; their license notices remain in their distributed packages. They are not copied into the office renderer. Run `npm ci` to reproduce the tool installation.

## DEV-75 appearance and studio additions

No new third-party art or code was imported. `src/art.ts` contains original room drawings and uses the already licensed character templates for roster portraits. The extracted sprite resolver accepts a small office palette override and the depth-sorted renderer accepts an optional sprite resolver. Existing attribution/license disclosures are retained. Paperclip palette identifiers are API schema values; the color interpretation is original. Reference evaluation, separate code/art decisions, limitations and non-reuse are documented in [identity/art direction](docs/identity-art-direction.md).
