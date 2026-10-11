# PR 24 — developer round 2 remediation

Reviewed baseline: `f53f0ddac9ac6470c3e870e96f9b65b86ea245e4`.
Rejected head: `3b5e233754eeb6bb6f02e289937ab0d1b9a60ea7`.

- RV-1 fixed: west-edge art, bookshelf and plant paint after all workspace rugs. Coordinates and geometry are unchanged.
- RV-2 fixed: each desk grounding oval paints after its rug and before its desktop.
- RV-3 deferred: the existing contact ellipses remain. A radial-gradient cache would add a rendering/cache change outside the blocking static-layer correction and needs separate visual and allocation validation.
- RV-4 fixed: removed per-ghost smoothing assignments; the renderer already enables high-quality smoothing for the canvas.

Regression coverage records actual drawing commands for two fully occupied modules, requiring rugs before standing props and rug < grounding < desktop for all twelve seats. Browser coverage uses six occupied seats at DPR 1 and 3 with reduced motion. At both DPRs, scene-coordinate shelf samples (32,253) and (46,253) are RGBA (201,164,124,255), exactly wood #c9a47c; pot samples (39,375) and (44,375) are (189,146,120,255), exactly #bd9278. These points lie inside the overlapping middle/bottom left rugs and prove no tint reaches the materials.

Validation:

- `npm run build`: typecheck and production build passed.
- `npm test`: 122 passed, zero failures.
- `OFFICE_TEST_PORT=43981 NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npm run test:browser -- tests/browser/environment.spec.ts tests/browser/canvas-allocation.spec.ts tests/browser/roster.spec.ts`: nine passed, covering six-seat pixels, DPR 3 forty-agent expansion, desktop DPR, dynamic roster, narrow layouts and outbound/return handoffs with and without reduced motion.
- `git diff --check`: passed.

The browser command needs loopback proxy exclusion in this runner. Initial attempts without it failed the server availability preflight before running tests.

Screenshot: [six occupied seats](evidence/DEV-208-six-seats.png). Browser tests also produce DPR 1 and DPR 3 screenshots in `test-results/DEV-208-six-seats-dpr-{1,3}.png`.

This push requires fresh QA and reviewer approval. No merge or auto-merge was requested or performed.
