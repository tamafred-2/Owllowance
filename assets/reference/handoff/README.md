# Owllowance — Consolidated asset handoff

This is the current artwork handoff, not a completed Expo integration or final production export set.

## What to copy into your code

Copy `assets/mascot/` and `assets/backgrounds/forest/` into your project assets directory. Keep the semantic filenames. All mascot output canvases are 440 × 450 so swapping reactions preserves the placement box. The source atlases are for future animation preparation, not finished production spritesheets.

`assets/brand-drafts/` contains the earlier geometric owl symbol, white-background wordmark and square app-icon concept. These have NOT been approved as the final anime-aligned branding. Do not treat them as editable SVG or store-ready icon exports.

## Included

- Anime owl: awake static, sleeping static, looping night blink.
- Four one-shot reactions: day tap, night tap, income acknowledgment, expense acknowledgment.
- Reaction GIFs, full-alpha animated WebPs and static reaction posters.
- Eleven separate forest PNGs: dawn, sunrise, morning, forenoon, noon, afternoon, dusk, twilight, evening, night and midnight.
- Earlier logo, wordmark and app-icon PNG drafts, kept separate.
- Palette tokens and a proposed icon-name registry (no font or icon package binaries).
- Source animation atlases and reaction durations in `manifest.json`.
- `preview/index.html`: extract the whole folder and open to try day/night taps and simulated save reactions. The preview shows morning/night backgrounds; all eleven backgrounds are supplied for later scene integration.

## Behavior to implement

Day: sleeping → tap → one eye opens → sleeping.
Night: awake blink → tap → friendly wink → awake blink.
Successful income save: small celebration → time-appropriate idle.
Successful expense save: calm nod → time-appropriate idle.
Use these only after the database commit succeeds. Transfers and opening balances are not income. GIFs alone do not connect to app events; the app must select, play and reset them.

Respect reduced motion with PNG fallbacks. Pause animation when Home is offscreen or the app is backgrounded. Use one shared mascot controller. Keep financial calculations outside animation/UI code. Keep forms and amounts readable on solid surfaces.

## Still pending

Final branding approval/alignment; editable SVG and monochrome masters; platform app-icon/favicons/splash exports; licensed font/icon installation; optimized asset sizes; native animation controller and Android/web playback checks. Verify iOS separately. The current PNGs are source-resolution images. Do not preload all eleven backgrounds unnecessarily.

## Verification limits

Files decoded, GIF durations/loop settings checked, archive integrity checked, direct preview links checked and JavaScript syntax checked. Actual browser interaction and Android/iOS integration have not been verified. Generated frames can have minor contour differences. GIF transparency is limited; WebP offers cleaner edges when supported. Existing photorealistic drafts and superseded geometric full-body mascots are excluded.

## Documentation

Reference notes in `docs/` preserve earlier explanations; paths there refer to their original packs. The paths in this README and manifest are authoritative for this consolidated download. This handoff supersedes downloading three separate packs; no repository files were modified.
