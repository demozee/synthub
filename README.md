# Synths Lab Graphic Texture

Version: `V1.8`

A browser-based graphic texture generator for turning images, video frames, and SVG assets into print-inspired visual styles such as thermal-map compositions, halftone graphics, pen-trace outlines, rough ink, distressed grain, and fabric-like texture.

## Local Preview

```bash
python3 -m http.server 4178
```

Open:

```text
http://localhost:4178/tools/graphic-texture-demo.html
```

## Project Structure

```text
.
├── index.html
├── package.json
├── assets/
│   ├── TE20L.woff2
│   ├── browser-icon.svg
│   ├── download-icon.svg
│   └── logo-svg.svg
└── tools/
    └── graphic-texture-demo.html
```

## Version Notes

### V1.8 - Figma Desktop and Mobile UI Refinements

- Reworks the desktop Synthub layout with updated yellow and blue theme colors, exported icon assets, preset cards, color controls, and output dock states.
- Adds the redesigned mobile Graphic Texture interface with fixed top/bottom regions, upload/camera entry points, 390px result preview behavior, mobile presets, FG/BG/RE controls, and color wheel interaction.
- Keeps source, mask, result, randomization, reverse, and PNG output behavior connected across desktop and mobile.
- Adds throttled render scheduling for smoother color and parameter interactions.

### V1.7 - Synthub UI and Transparent Output

- Restores the Figma-aligned Synthub interface with updated branding, title spacing, effect labels, controls, and output dock behavior.
- Adds the Synthub browser favicon and updates the page titles for the V1.7 release.
- Reworks transparent-background output per preset so halftone, pen trace, Xerox, and thermal-map styles keep the intended foreground treatment while removing only the background.
- Adds the mobile camera input, mobile effect carousel, mobile parameter panel, and fixed mobile output dock.
- Keeps Xerox texture, scanline, grain, and distress details inside the graphic area when the background is transparent.

### V1.6 - Paper Texture Rendering

- Replaces the tiled hash-noise background with continuous procedural paper/fiber texture so the canvas no longer looks like repeated small texture patches.
- Lowers the default background texture intensity for a cleaner print-material feel.
- Applies the new texture model consistently across Thermal Map, Pen Trace, and the shared render path.
- Keeps decorative paper texture out of transparent-background output so exported PNGs stay cleaner.

### V1.5 - UI 2.0 Fixes

- Updates the UI 2.0 sidebar layout with the latest Synths Lab branding, Figma-style input block, preset controls, effect-chain list, and fixed output dock.
- Moves source and mask previews into the left input panel to keep the center canvas focused on the generated texture result.
- Refines the output and reverse controls, transparent-background behavior, and mask-based texture clipping logic.
- Improves randomization behavior so enabled print effects have visible impact after random generation.
- Fixes effect-chain toggles for distressed grain and print texture so on/off states map clearly to the rendered result.
- Keeps the browser workflow focused on image, SVG, PDF, WebP, PNG, and JPG input with PNG export.

### V1.3

- Adds a simplified mobile workflow with upload, presets, randomization, preview, and PNG export.
- Hides advanced effect-chain controls and technical previews on mobile.
- Detects transparent PNG and SVG assets through their alpha channel.
- Preserves the source aspect ratio throughout processing, preview, mask generation, and PNG export.
- Updates the random button color to `#0071BB`.

### V1.2

- Refines the three-column interface and responsive preview sizing.
- Adds unified image, SVG, and PDF input.
- Updates typography, branding, color controls, and preset-chain layout.
- Keeps the random action with presets and fixes PNG export to the right sidebar footer.
- Improves mask extraction, rough edges, color rendering, and decorative effect controls.

### V1.1

- Independent clean project for version management.
- Includes the current Graphic Texture demo only.
- Fixes the graphic color control so it edits the actual output graphic color.
- Adds throttling for color dragging to reduce preview stutter.

## Deploy

This is a static site. It can be deployed directly with GitHub Pages from the repository root.
