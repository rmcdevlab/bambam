# BAM admin hero asset provenance

Generated with the built-in image_gen tool on 2026-11-18 using the existing BAM sprite sheets as identity references. The two exact prompts are retained beside this file.

Production asset: `frontend/public/brand/bam-mascot-admin-sequence-v3.webp` (401,280 bytes, 1536 × 1024, 24 frames in a 6 × 4 grid, genuine alpha). `admin-hero.tsx` loads this asset directly from `/brand/`; it does not load anything from `output/`.

The initial generation added detailed intermediate wave, unroll, read and lift poses. A targeted edit retained the existing open-palm ending towards the ticket card. The final PNG was converted to WebP with Sharp at quality 90, alphaQuality 100, effort 6.

Source originals remain in the image generator's local history under `C:/Users/pithawat/.codex/generated_images/01a1ed72-4905-72e2-af0c-3efd61d364d9/` (initial `exec-b496c5f5-6622-4b0c-aeb9-cdbf3d094502.png`, final `exec-ac15d796-2199-482e-b7a2-0af99a554c9b.png`). They are not runtime dependencies. Duplicate PNGs, screenshots, recordings, build logs and the one-off browser script from `output/admin-hero-motion/` were removed at the owner's cleanup request.

Validation without the root `output/` directory: a fresh mock Next.js dev server successfully served Admin `/` (including mascot and both ticket/list dialogs), employee `/repair/my`, and technician `/repair/work`. No page errors or failed static requests. Lint and typecheck passed. Production build remained blocked by Google Fonts connectivity (Anuphan / IBM Plex Sans Thai), not a missing local file. Historical prototype folders were restored after this check.
