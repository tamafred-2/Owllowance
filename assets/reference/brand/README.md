# Owllowance — Enhanced branding and opening animation v5

This pack replaces the earlier geometric brand drafts with a softer owl-head direction derived from the agreed anime mascot. It does not replace the forest backgrounds or full-body owl reactions. User approval of the new logo is still pending.

## Included

- `brand/owl-mark.png`: transparent logo artwork.
- `brand/owllowance-wordmark-white.png`: primary lockup on white with descriptor.
- `brand/app-icon-source.png`: square padded icon concept, not store-specific exports.
- `motion/opening.gif`: one-shot wake animation.
- `motion/loading-loop.gif`: gentle repeating blink while actual startup is pending.
- Matching animated WebP files, plus static `motion/logo-awake.png` and `logo-asleep.png` fallbacks.
- `preview/index.html`: extract and open for the startup demonstration. Use Finish loading demo to represent app readiness; no real application is loading.
- Source animation atlas and file manifest.

## Design

Navy outer head, cream face and restrained gold beak; the same amber irises, dark pupils, highlights, eye geometry and spacing as the approved anime mascot. The logo uses the mascot’s head rather than redesigning its facial anatomy. Logo-only cream/gold additions do not automatically change the existing app UI palette. The generated PNGs may contain subtle tonal variation; they are raster artwork, not editable vector masters or color-certified exports.

## Startup sequence

1. Use a static logo on the native splash surface while application UI initializes.
2. Once application UI is mounted, show the one-shot wake animation if essential startup is still pending.
3. If work remains, use the gentle blink loop with a real indeterminate loading indicator and concise status text.
4. As soon as essential initialization is ready, leave the opening screen immediately. Never impose an artificial minimum delay or wait for a blink to finish.
5. On failure, stop the animation and show useful error/retry UI. Do not leave the user in an endless loading loop.

Reduced motion uses the static awake logo and status text. Hidden/offscreen UI should stop animation. The preview demonstrates hidden-tab and reduced-motion behavior but is not a native implementation. A loading animation is not a progress percentage and should not be wired to decorative delays in production.

## Integration

Copy `brand/` and `motion/` under your project's assets, using shared asset keys. Replace references to the old brand-drafts only after reviewing this direction. Keep the original full-body anime owl for Home reactions. Existing forest/reaction assets remain in the previous consolidated download.

The preview is a standalone HTML/CSS/JS demonstration. No Expo dependencies, app configuration or repository were changed. Android, iOS and actual interactive browser playback remain unverified. Editable SVG/monochrome masters and platform-specific icon/splash exports are still pending. Source GIFs use binary transparency; WebP preserves cleaner full-alpha edges where supported.

## Identity correction

The first enhanced-logo attempt incorrectly replaced the mascot’s amber irises with solid navy eyes. The user rejected that inconsistency. Those images and their derivatives are excluded. The approved full-body anime mascot remains the identity reference; logo, app icon and startup eyes must follow it.
