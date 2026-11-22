# BAM admin hero asset provenance

Generated with the built-in image_gen tool on 2026-11-18 using the existing BAM sprite sheets as identity references. The two exact prompts are retained beside this file.

Production assets (2026-11-22): `frontend/public/brand/bam-mascot-admin-hd-v6-{1..6}.webp` — six 1448 × 1086 sheets, 4 × 3 slots of 362 px each (72 slots, genuine alpha). `admin-hero.tsx` loads them directly from `/brand/` and lists the play order per phase. The sections below describe the earlier v3 sheet.

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
