# Create your own pet

Turn a favorite character into a desktop companion, drawn by hand or with an image generation tool. A pet needs sprite sheets and registration data; Antumi provides walking, jumping, blinking, and mouse interaction.

Pets are currently built and distributed through the pet resource repository. Settings does not yet import local images or ZIP files directly. Copy this guide to give an agent the requirements for preparing the artwork and configuration.

## 1. Design the character and artwork

Start with a complete character reference, then create each pose from it. Keep the same identity, proportions, colors, and material across frames, facing right by default; the app mirrors the character when it turns. A distinct head and body, clear eyes, and recognizable limbs make registration and animation easier.

Use static WebP images with transparent backgrounds, not animated images. Keep the entire character, antennae, and limbs within each cell with some room at the edges. Include no text, grid lines, or background. Keep a consistent foot baseline in standing and walking frames, with a continuous sequence of contact, support, lift, and swing.

| File | Pixel dimensions | Content |
|---|---|---|
| `poses.webp` | 1024 × 1024 | 4 columns × 4 rows, 256 × 256 per cell; layout below |
| `walk.webp` | 1024 × 768 | 4 columns × 3 rows, 12 continuous walking frames in row order, 256 × 256 per cell |
| `face.webp` | 288 × 80 | 3 columns × 1 row, 96 × 80 per column; facial material to fill behind animated eyes |
| `preview.png` | Recommended 136 × 136 | Small Settings preview; embedded in the catalog at build time, excluded from the ZIP |

Arrange `poses.webp` from left to right, top to bottom:

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
|---|---|---|---|---|
| 1 | Idle | Waiting | Working (running) | Review |
| 2 | Sad (failed) | Waving | Jumping | Sitting (sit) |
| 3 | Napping (nap) | Hanging (hang) | Reserved | Sprinting (sprint) |
| 4 | Legacy walk 1 | Legacy walk 2 | Legacy walk 3 | Legacy walk 4 |

Walking currently uses the separate `walk.webp`; peeking reuses the idle head. Follow the reference resource layout for the reserved and legacy cells.

The optional typing pose requires both `typing.webp` and `typing-base.webp` (512 × 512 each), together with `rig.typing`. The first shows the complete character at a computer with both hands on the keys; the second removes both arms and fills in the body and keyboard. Incomplete sets fail validation. Start with the three base images for a first pet.

## 2. Register the head, eyes, and walk

Copy an existing pet in the [pet resource repository](https://github.com/flyhero/antumi-pets) to `pets/<your-pet-id>/`, using its `rig.json` as a starting point. Measure the new artwork rather than keeping the old coordinates after replacing the images.

Registration uses **256 × 256 cell coordinates**, with the origin at the top left, x increasing rightward, and y downward. The 512px typing images use the same coordinate basis.

| Configuration | What to provide |
|---|---|
| `layout.head` | Idle head rectangle including antennae: left, top, right, bottom |
| `layout.idleNeck` / `idleFloor` | Idle neck connection point and foot baseline |
| `layout.walkNecks` / `walkFloor` | One neck connection point for each of the 12 walking frames and a shared walking foot baseline |
| `faces` | At least the idle neck position; eye centers, radii, angles, and local material tone adjustments for each pose as needed; closed-eye poses may omit eyes |
| `eyes` | Style: textured (original iris), stitched, or ink; colors, facial material column, and sampling offsets |
| `armEdge` | Arm clipping boundary as a percentage from 0 to 100 |
| Optional `typing` | Vertical offsetY, overall scale (optional, defaults to 1, anchored at the bottom center of the canvas), typing cycleMs, and each arm's clipping path (clip), shoulder pivot, and lift angle |

Coordinates range from 0 to 256. Necks must be above the foot baseline, head rectangles must have positive width and height, and `walkNecks` must contain exactly 12 entries. See the [Format 1 definition](https://github.com/flyhero/antumi/blob/main/packages/protocol/src/pet.ts) for all fields and ranges.

## 3. Build the resource pack

Add your new id with Chinese and English names and descriptions to `scripts/build.mjs` in the resource repository. Place the artwork and `rig.json` in `pets/<id>/`, and set the version in that repository's `package.json`. With Node.js 22.13 or later, run from the resource repository:

```sh
node scripts/build.mjs
node --test scripts/*.test.mjs
```

The script generates `manifest.json`, `dist/<id>-<version>.zip`, and `dist/catalog.json`, and updates the repository's `catalog-v2.json`. It calculates file sizes and SHA-256 digests automatically; do not enter these by hand or reuse old digests.

Resource packs must meet these requirements:

- Use `format: 1`. The id is at most 64 characters, starts with a lowercase letter, and contains only lowercase letters, digits, and hyphens. Choose a new id rather than replacing clay, moss, or zip. Use three numeric version components, such as `1.0.0`.
- Supply zh and en names and descriptions, each 1–160 characters. The manifest id and version must match the catalog entry.
- The ZIP root contains only `manifest.json`, the three base WebP images, and any fully declared optional typing images. Exclude wrapping folders, `rig.json`, previews, scripts, duplicate files, and symbolic links. The build script embeds rig data in the manifest.
- Both the ZIP and the total extracted contents must be at most 4 MiB. Each WebP is at most 2 MiB and the manifest at most 64 KiB. Image dimensions, byte counts, and SHA-256 digests must match.
- Catalog previews may be PNG or WebP, at most 512px on each side, with an encoded data URL no longer than 48,000 characters. The existing build script reads `preview.png`.

## 4. Preview in a development build

You need an Antumi source development environment. Run this from the main Antumi repository, replacing the example path with your resource repository's actual `dist` path. In Windows PowerShell, set `$env:ANTUMI_HOME` and `$env:ANTUMI_PET_DIRECTORY` first, then run `pnpm dev`.

```sh
ANTUMI_HOME=~/.antumi-demo ANTUMI_PET_DIRECTORY=/path/to/antumi-pets/dist pnpm dev
```

Open **Settings → Pet** and select **Download & use** for your pet. In this development environment the button reads local build outputs and still performs full package validation. Test data stays in the separate demo directory.

Check idle, working, waiting, and failed states, then blinking, gaze, turning, walking, dragging, and peeking for smooth connections. Check transparent edges and static frames at the smallest and largest sizes, on light and dark backgrounds, and with reduced motion. After changes, increase the version, rebuild, then select **Update & use** in Settings.

## 5. Submit your pet for recommendation

Once you have built and previewed your pet, host the resource pack or source repository at a publicly accessible URL. Then [submit the link in an Antumi Issue](https://github.com/flyhero/antumi/issues/new) to have it considered for recommendation.

Include the pet's name and description, a preview image or animation, the resource pack or source repository link, and your preferred author credit so the artwork and format can be reviewed.

After review, Antumi's author may add suitable pets to the recommendations so other users can discover and download them in **Settings → Pet**.

Recommended pets are distributed through the catalog and Release attachments in the [pet resource repository](https://github.com/flyhero/antumi-pets). Antumi's author handles inclusion and publication. Keep published versions unchanged and increase the version for changes.
