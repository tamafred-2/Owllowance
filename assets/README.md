# Owllowance assets

App-ready artwork is grouped by purpose. Use semantic imports from `src/design-system/artwork.ts`; do not embed file paths in screens.

| Folder | Contents |
|---|---|
| `brand/` | Owl mark, white wordmark and app-icon concept |
| `motion/` | Original motion assets, static fallbacks and transparent Android launch drawable |
| `mascot/` | Day/night owl, tap/save reactions and static posters |
| `backgrounds/forest/` | Eleven illustrated time-of-day scenes |
| `backgrounds/forest/optimized/` | 1280×720 JPEG runtime copies; PNG masters remain intact |
| `source/` | Original atlases for future editing; excluded from runtime imports |
| `previews/` | Standalone [owl](previews/mascot/index.html) and [opening](previews/opening/index.html) demos |
| `reference/` | Original handoff notes, proposed tokens and original manifests |
| `licenses/` | Supplied third-party license notices |

[manifest.json](manifest.json) lists current artwork paths, dimensions, frames, sizes, hashes and provenance. Original reference documents retain historical pack paths; use this README and the root manifest for current locations.

All 57 original supplied/existing files were preserved and hash-verified during reorganization. Original pixels and animation encodings remain unchanged. Runtime forest JPEGs were subsequently generated at the user's request using `scripts/optimize-forests.ps1`, reducing combined background bytes by 90.1%. Preview links use the original artwork. GIF is used in the app with PNG fallbacks; animated WebP alternatives remain available. Only current-scene images are decoded by the dashboard; source atlases and demo pages are never runtime imports.

Separate artwork license files, editable vector masters, store-specific icon/splash exports and custom fonts were not supplied. Using the supplied startup artwork does not imply final store-branding approval.
