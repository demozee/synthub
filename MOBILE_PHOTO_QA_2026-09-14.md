# Mobile Photo Editor QA

## Design and scope

Figma file `jC88kq1vSYDLWHz183lF9t`, nodes `6030:53`, `3609:1499`, `6475:279`.

- Gallery and native photo-camera selection feed the same image editor.
- Mobile camera entry invokes `cameraFile` synchronously (`image/*`, `capture="environment"`). It no longer enters the custom live-preview/record/review flow.
- Camera cancellation does not clear the image, settings, or palette. Successful replacement occurs after image decoding.
- Mobile rejects videos, SVG, and PDF. Other photo MIME types are decoded by the browser; decode failures preserve the existing image and show a recoverable error.
- FG/BG expose color readouts and transparency only. NICE TRY still randomizes colors; reverse remains available.
- At 390x820, portrait preview is 520px tall; extreme proportions clamp between 390px and 576px. Short screens reserve 156px for controls and the actual safe-area-aware dock height, reducing only the contained preview.
- The normal action column is 102px; extreme-ratio variants use 80px with a separator, matching the supplied nodes.
- Desktop capture/import and rendering behavior are unchanged. Legacy web-recording helpers remain dormant to avoid an unrelated renderer refactor; no mobile entry calls them.

## Automated and visual checks

Run the local harness with `node tools/mobile-regression.cjs`, then open `/tools/mobile-qa.html?case=portrait` on port 4175.
The harness uses real image decoding, application import handlers, canvas rendering, controls, and export preparation. File-picker opening and OS sharing are simulated, not native-device tests.
Results are exposed on the HTML element's `data-qa` attribute.

Checked in the in-app Chromium browser:

| Viewport | Scenario | Result |
| --- | --- | --- |
| 390x820 | Portrait import, 520px preview | Pass |
| 390x820 | Tall import, 576px preview and 80px actions | 30 checks pass |
| 375x812 | Wide import, full image contained | 30 checks pass |
| 430x932 | Camera-file return and replacement | 30 checks pass |
| 390x654 | Tall import with 34px simulated bottom safe area | 30 checks pass |
| 390x844 | User cancels OS share | 30 checks pass |
| 390x844 | Unsupported sharing, recoverable save preview | 30 checks pass |

- Layout screenshots verified no clipping of the action columns, 28px preset icons, 20px alpha glyphs, 16px preview-to-controls spacing, and 4px control-row spacing.
- Verified no manual mobile color inputs, both transparency toggles, reverse, randomized palette, same-photo reselection, failed import preservation, video rejection, and zero `getUserMedia` calls.
- Clicked all four preset buttons through browser automation; each reached the expected active state and retained the 750x1000 portrait output dimensions.
- Resized an existing editor from 390x844 to 390x654 without reloading: preview became 410px and controls stayed above the dock.
- Desktop 1440x900 inspected with no browser errors.
- `node tools/check-release.cjs`: passes syntax, 12 recipe/quality roundtrips, GT2/GT3 compatibility, output dimensions, static assets, and release exclusions.
- `git diff --check`: passes.

## Device verification still required

- Actual iPhone Safari and Android native camera opening, permission/OS picker UI, cancellation, retake, and file return.
- HEIC/HEIF decoding and EXIF orientation using actual device photos. Unsupported decoding is handled, but no universal format support is claimed.
- Actual Safari browser-chrome transitions and hardware safe-area behavior; viewport and safe-area simulations are not a substitute for device testing.
- Photos-library saving through the OS share sheet. The webpage cannot silently write into the user's Photos library; existing direct-share/fallback behavior is preserved.

No release/version name was changed and no GitHub push was performed for this change.

## UI follow-up: 2026-09-15

Re-read the four current Figma nodes: `3609:1499`, `6475:279`, `6030:53`, and `6475:223`.

- Entry: 60px top-left brand, separate wordmark and Chinese mark, 105px upload group at y=244 on the 390x820 reference viewport, and exact exported 74px guide-line assets. Short viewports compress whitespace; very short entry views can scroll.
- Editor: centered bilingual active-preset heading at y=30, synchronized after preset changes and NICE TRY. A subtle text shadow keeps the white heading readable on light images; this DOM overlay is not exported.
- Matched the extreme-ratio separator, reverse-icon size, output border, and color-readout weight. Entry toast now renders above the entry screen.
- Preserved native-photo import, transparency, reverse, palette randomization, and export behavior. No desktop style rules changed.
- In-app Chromium checks: 390x820 portrait and tall, 375x812 wide, 430x932 camera-file return, and 390x654 tall with simulated 34px bottom safe area. Each editor run has 33 checks. Entry checks cover brand size, icon-to-copy clearance, overflow, and toast stacking at 375x812, 430x932, and 390x654 with simulated safe area.
- Screenshots reviewed for entry, normal, wide, and tall layouts. No browser errors reported. Release checks and `git diff --check` pass.
- Local mobile preview HTML and brand asset return HTTP 200 with `Cache-Control: no-store`. This update remains local, without a version change or GitHub push.
