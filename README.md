# Synths Lab Graphic Texture

Version: `V1.1`

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
│   └── synths-logo.svg
└── tools/
    └── graphic-texture-demo.html
```

## Version Notes

### V1.1

- Independent clean project for version management.
- Includes the current Graphic Texture demo only.
- Fixes the graphic color control so it edits the actual output graphic color.
- Adds throttling for color dragging to reduce preview stutter.

## Deploy

This is a static site. It can be deployed directly with GitHub Pages from the repository root.
