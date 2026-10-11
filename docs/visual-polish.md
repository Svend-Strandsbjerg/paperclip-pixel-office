# Existing-zone visual polish

This pass preserves baseline `f53f0dd` geometry: desks remain on the left;
collaboration, coffee and lounge remain in the right strip. Layout, movement,
coffee destinations, activity anchors, workstation placement and provider code
are unchanged. The task owner's clarification supersedes the original reversed
left/right descriptions.

Window-sill greenery, slim west-edge storage, framed art, task lamps and
stationery enrich the work area. Planning marks, a board tray, coffee supplies,
shelf storage and warmer lamp spill enrich the existing shared areas. These
are reusable canvas primitives, painted into the existing static environment
cache. West-edge furniture ends at x=56, clear of every reserved desk and route;
new shared props stay on existing furniture. Floor shadows are passable.
Module palettes and foliage still use the existing deterministic variants.

Ghosts retain their native image, silhouette, palette and motion transforms.
A 192px alpha-masked lighting overlay adds a subtle upper-left highlight and
lower-right shade. It is cached in a WeakMap per loaded image and reused by
agents sharing that image. The original artwork is drawn directly; there is
no body reconstruction, mirroring, new animation, per-frame filter or readback.
Three faint contact ellipses replace the hard ground shadow. Reduced motion
uses the same static presentation.

## Visual evidence

The matching desktop captures use four idle specialist fixtures, DPR 2,
reduced motion and the real cap-v1 orchid-peach asset fetched from Paperclip.
The same native PNG is served locally to both captures to avoid network timing
changing an avatar to the loading fallback. Names and states are synthetic.

- [Baseline](screenshots/dev205/before-desktop.png)
- [Polished](screenshots/dev205/after-desktop.png)

## QA reproduction

Build with `npm ci && npm run build`, then start with
`OFFICE_MODE=demo HOST=127.0.0.1 PORT=4398 npm start` and visit `/`.

`tests/browser/roster.spec.ts` exercises production-like specialist fixtures,
roster growth to 40, removal, stable placement and both handoff directions.
`tests/browser/canvas-allocation.spec.ts` covers desktop DPR 2 and narrow
40-agent DPR 3, including the final module and canvas memory bounds.
`tests/browser/office.spec.ts` covers mobile, reduced motion, working effects,
delivery documents, labels and returns to the unchanged workstation anchors.
Use the demo controls for animated inspection; scroll horizontally on narrow
screens and vertically through additional studio modules.

The browser suites also exercise the neutral fallback. QA should additionally
inspect multiple native avatar palettes and actual coffee gatherings in the
connected office. New decoration must remain behind ghosts and leave labels,
carried items and work effects readable. Human merge follows Browser QA and
Reviewer approval of the exact PR head SHA.
