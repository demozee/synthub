# Synths Lab Graphic Texture

Version: `V1.5`

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
│   ├── download-icon.svg
│   └── logo-svg.svg
└── tools/
    └── graphic-texture-demo.html
```

## Version Notes

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
