# BAM admin hero asset provenance

## Current: snow leopard sheets (D-181, 2026-11-24)

S29 now loads `frontend/public/brand/bam-leopard-admin-{1..6}.webp`, using the same 1448 × 1086 layout, 72 slots, play order (`admin-mascot-motion.ts`) and canvas player as below. The tiger v6 sheets are archived in `docs/shared/style/references/mascot-tiger-archive/`.

- Sheets 1 and 3–6 were generated with Codex `image_gen`. Each prompt used the matching tiger v6 sheet as the pose reference, the leopard master as the identity reference, and leopard sheet 1 for consistency. The untouched generator PNGs are in `docs/shared/style/references/mascot-leopard/admin/`. Prompts and session ids are in `frontend/scripts/assets/mascot-leopard-v1.json`.
- Sheet 2 was not generated. It re-uses registered sheet-1 slots `[10, 9, 8, 9, 10, 11, 7, 6, 5, 2, 1, 0]`: the wave continues, then the paw lowers back to the idle pose holding the roll. This makes slot 23 identical to slot 0.
- Registration used the v6 recipe: each slot's feet are placed on ground line 350.5 px and the shoe centre at x 190 px.
  - Scale per sheet is 0.9688 / – / 0.957 / 0.946 / 0.968 / 0.967.
  - Sheet 1 is scaled to the tiger's 341 px height. The other sheets use the geometric mean of the head-width and figure-height ratios against sheet 1, because sheet 4 again draws a larger head on a shorter body.
  - No opaque pixel falls outside a cell.
- Boundary easing (CR-060 amendment 2): sheets 3–6 now carry baked per-frame transforms (scale about the shoe anchor, plus an offset).
  - The cuts are 23→24, 34→38, 47→50 and 54→60; slots 35–37, 48–49 and 55–59 are not played.
  - The first frame after each cut matches the previous frame; the next 5–8 frames return to the registration above.
  - Fitted values and per-frame transforms are in `leopard-easing.json`.
  - Mean frame difference at the cuts is now 12 / 19.5 / 19.5 / 15.8, down from 13.5 / 28.2 / 24.3 / 20.6. Within a sheet it is about 4–10. The remainder is drawing detail that differs between the separately generated sheets.
- Known difference: the suit on sheet 4 is a slightly brighter royal blue than on the other sheets.

## Previous: full-character frames, one canvas (CR-060 amendment, 2026-11-24)

## Current: full-character frames, one canvas (CR-060 amendment, 2026-11-24)

The owner rejected the articulated rig and requested complete image changes again. S29 loads the original six `bam-mascot-admin-hd-v6-{1..6}.webp` sheets described below. No new raster assets are needed. The rejected rig component, asset and prompt file were removed from the working changes.

`admin-mascot-frames.tsx` draws one complete sprite cell on one 362 × 362 canvas. It clears the whole previous frame before drawing, including the transparent space vacated by moving paws, so no previous silhouette accumulates behind BAM. There is no opacity blending. All sheets decode before playback. `admin-mascot-motion.ts` authors a 5.1 s sequence: two waves, short unroll/read, look up/lift, then open-palm presentation. Frame 41 is the data-wait pose; frame 71 is the final pose. Existing v6 registration anchors the feet and scale.

The following sections retain the original artwork provenance and registration recipe.

Generated with the built-in image_gen tool on 2026-11-18 using the existing BAM sprite sheets as identity references. The two exact prompts are retained beside this file.

Production assets (2026-11-22): `frontend/public/brand/bam-mascot-admin-hd-v6-{1..6}.webp` — six 1448 × 1086 sheets, 4 × 3 slots of 362 px each (72 slots, genuine alpha). `admin-hero.tsx` preloads them from `/brand/`; `admin-mascot-motion.ts` defines the play order. The sections below describe the earlier v3 sheet.

## v6 = v5 re-registered (2026-11-22)

v6 keeps every v5 slot in place; each sheet was only rescaled and repositioned (Lanczos3, one resample), because v5 changed BAM between sheets:

- Measured on v5 (362 px cells): ground line (lowest opaque row) 350 / 352 / 346 / 350 / 351 / 340 px for sheets 1–6, overall height 339 / 346 / 336 / ~325 / 333 / 325 px, and sheet 6's shoe centre stepping 211 → 204 → 196 → 189 px across each row (uneven column pitch).
- Uniform scale per sheet, against sheet 1: 1, 0.980, 1.009, 1.005, 1.015, 1.050 (from the height at each sheet boundary; sheet 4 draws a larger head on a shorter body, so its scale splits the height and head-width ratios).
- Each slot is placed with its feet on ground line 350.5 px and its shoe centre at x 190 px (centred over the hero shadow, and leaves room for the final open palm). No opaque pixel falls outside a cell.
- Verified on v6: every slot's lowest row is 349–351 px and its shoe centre 190–191 px.
- Slots 3 (paw opened at the waist) and 23 (paper already pulled sideways, sheet 3 restarts one step earlier) stay in the sheets but are not played.

The v5 sheets (`bam-mascot-admin-hd-v5-*.webp`) are no longer loaded.

The initial generation added detailed intermediate wave, unroll, read and lift poses. A targeted edit retained the existing open-palm ending towards the ticket card. The final PNG was converted to WebP with Sharp at quality 90, alphaQuality 100, effort 6.

Source originals remain in the image generator's local history under `C:/Users/pithawat/.codex/generated_images/01a1ed72-4905-72e2-af0c-3efd61d364d9/` (initial `exec-b496c5f5-6622-4b0c-aeb9-cdbf3d094502.png`, final `exec-ac15d796-2199-482e-b7a2-0af99a554c9b.png`). They are not runtime dependencies. Duplicate PNGs, screenshots, recordings, build logs and the one-off browser script from `output/admin-hero-motion/` were removed at the owner's cleanup request.

Validation without the root `output/` directory: a fresh mock Next.js dev server successfully served Admin `/` (including mascot and both ticket/list dialogs), employee `/repair/my`, and technician `/repair/work`. No page errors or failed static requests. Lint and typecheck passed. Production build remained blocked by Google Fonts connectivity (Anuphan / IBM Plex Sans Thai), not a missing local file. Historical prototype folders were restored after this check.
