/* Native-size still-image output. Style coordinates stay on the selected L/M/H grid. */
function outputFieldSample(field, width, height, x, y, rgbaAlpha = false) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const stride = rgbaAlpha ? 4 : 1, offset = rgbaAlpha ? 3 : 0;
  const a = field[(y0 * width + x0) * stride + offset], b = field[(y0 * width + x1) * stride + offset];
  const c = field[(y1 * width + x0) * stride + offset], d = field[(y1 * width + x1) * stride + offset];
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

async function redrawStillImageOutput(targetCanvas, targetCtx, outputSize, styleSize, onProgress = () => {}) {
  const sourceElement = state.source;
  const aspect = state.sourceAspect;
  const preset = state.preset;
  const nodes = clone(state.nodes);
  const transparent = isTransparentOutput();
  const clipDecor = shouldClipDecorToMask();
  const hasTransparency = state.sourceHasTransparency;
  const { width: ow, height: oh } = fixedOutputDimensions(outputSize, aspect);
  targetCanvas.width = ow;
  targetCanvas.height = oh;
  targetCtx.clearRect(0, 0, ow, oh);
  if (state.recipeCarrier) {
    // A recipe-carrier PNG is already flattened: never apply its effects twice.
    targetCtx.drawImage(sourceElement, 0, 0, ow, oh);
    return { width: ow, height: oh, mode: "flattened-source" };
  }
  const source = buildSourceImage(styleSize);
  const { width: sw, height: sh } = source;
  const baseMask = createMask(source);
  const continuousPen = usesContinuousPenTrace(preset, styleSize);
  const mask = new Float32Array(applyOutputReverseMask(continuousPen ? baseMask : createRoughEdgeMask(baseMask, sw, sh, nodes.edge), sw, sh));
  if (continuousPen) {
    const contours = createPenTraceStructure(source, mask, sw, sh, nodes, state.outputReverse, styleSize);
    targetCtx.save();
    targetCtx.scale(ow/sw,oh/sh);
    drawContinuousPenTrace(targetCtx, contours, sw, sh, nodes, transparent, styleSize);
    targetCtx.restore();
    onProgress(100);
    return {width:ow,height:oh,mode:"continuous-pen-paths",styleSize,contours:contours.length,layers:contours.stats};
  }
  const { ink, edge, distress, texture, decor, color, screen } = nodes;
  const inkRgb = hexToRgb(ink.color), edgeRgb = hexToRgb(edge.color);
  const bgRgb = hexToRgb(color.bg), hiRgb = hexToRgb(color.highlight);
  const inkAlpha = getColorAlpha(ink, "color") / 100;
  const edgeAlpha = getColorAlpha(edge, "color") / 100;
  const bgAlpha = transparent ? 1 : getColorAlpha(color, "bg") / 100;
  const hiAlpha = getColorAlpha(color, "highlight") / 100;
  const inkStrength = ink.strength / 100 * inkAlpha;
  const ref = preset === "thermalMap" ? thermalQualityRefinement(styleSize) : null;
  const field = (data, x, y, alpha = false) => outputFieldSample(data, sw, sh, x, y, alpha);
  let soft, body, glow, edgeMap;
  if (preset === "thermalMap") {
    const blurScale = ref ? Math.max(sw, sh) / 720 : 1;
    const decorBlur = decor.enabled ? decor.blur : 0;
    const bleed = texture.enabled ? texture.bleed : 0;
    const mc = createMaskAlphaCanvas(mask, sw, sh);
    soft = getBlurredMaskData(mask, sw, sh, (8 + decorBlur * .28 + bleed * .08) * blurScale * (ref?.soft ?? 1), mc);
    body = getBlurredMaskData(mask, sw, sh, (2 + edge.width * 1.6) * blurScale * (ref?.focus ?? 1), mc);
    glow = getBlurredMaskData(mask, sw, sh, (18 + decorBlur * .42 + bleed * .16) * blurScale * (ref?.glow ?? 1), mc);
    mc.width = mc.height = 0;
  } else if (edge.enabled && edge.width > 0) {
    edgeMap = new Uint8Array(createEdgeMap(mask, sw, sh, Math.max(1, Math.round(edge.width))));
  }
  const paperSeed = preset === "thermalMap" ? 121 : preset === "penTrace" ? 81 : 21;
  const paper = texture.enabled ? getPaperToneMap(sw, sh, texture, paperSeed) : null;
  const scanMap = texture.enabled && preset !== "penTrace"
    ? getPaperToneMap(sw, sh, texture, preset === "thermalMap" ? 123 : 5, preset === "thermalMap" ? 173 : 97) : null;
  const styleScale = ow / sw;
  const cell = Math.max(1, distress.size || 1);
  const amount = distress.enabled ? distress.amount / 100 : 0;
  const oldMean = (1 - amount * .52) * (1 - amount * .085 * .44) + amount * .52 * .18;
  const newMean = ref ? (1 - amount * .52 * ref.drop) * (1 - amount * .085 * ref.drop * .44) + amount * .52 * ref.drop * .18 : 1;
  const dropComp = ref && distress.enabled ? oldMean / newMean : 1;
  const grainFactor = ref?.grain ?? 1;
  const angle = screen.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const screenCell = Math.max(3, screen.dot), half = screenCell / 2;
  const screenActive = screen.enabled && screen.strength > 0;
  const directForeground = transparent && preset === "dotShirt";
  const strip = document.createElement("canvas");
  const stripCtx = strip.getContext("2d", { willReadFrequently: true });
  // Only a small native-source/output strip is allocated; no 4K-sized masks/noise maps.
  const rowsPerStrip = 64;
  try {
    for (let top = 0; top < oh; top += rowsPerStrip) {
      const rows = Math.min(rowsPerStrip, oh - top);
      strip.width = ow; strip.height = rows;
      if (!hasTransparency) { stripCtx.fillStyle = "#ffffff"; stripCtx.fillRect(0, 0, ow, rows); }
      stripCtx.drawImage(sourceElement, 0, -top, ow, oh);
      const pixels = stripCtx.getImageData(0, 0, ow, rows);
      const native = pixels.data;
      const output = targetCtx.createImageData(ow, rows), d = output.data;
      for (let yy = 0; yy < rows; yy++) {
        const y = top + yy;
        const sy = (y + .5) * sh / oh - .5;
        const iy = Math.max(0, Math.min(sh - 1, Math.round(sy)));
        for (let x = 0; x < ow; x++) {
          const i = (yy * ow + x) * 4;
          const sx = (x + .5) * sw / ow - .5;
          const ix = Math.max(0, Math.min(sw - 1, Math.round(sx)));
          const tone = clamp((255 - getLuma(native, i)) / 255, 0, 1);
          let m = clamp(field(mask, sx, sy), 0, 1);
          const textureStrength = texture.enabled ? (clipDecor ? m : 1) : 0;
          const paperTone = paper ? field(paper, sx, sy) * textureStrength : 0;
          let r = lerp(255, bgRgb.r, bgAlpha), g = lerp(255, bgRgb.g, bgAlpha), b = lerp(255, bgRgb.b, bgAlpha);
          let a = transparent ? 0 : 255;
          if (preset === "thermalMap") {
            const s = field(soft, sx, sy, true) / 255;
            const c = field(body, sx, sy, true) / 255;
            const halo = field(glow, sx, sy, true) / 255;
            const gradient = (Math.abs(field(soft, sx + 1, sy, true) - field(soft, sx - 1, sy, true))
              + Math.abs(field(soft, sx, sy + 1, true) - field(soft, sx, sy - 1, true))) / 255;
            const fuzzy = clamp(gradient * (4 + edge.rough * .045) * (ref ? Math.max(sw, sh) / 720 : 1), 0, 1);
            const coarse = distress.enabled && hash(Math.floor(ix / cell), Math.floor(iy / cell), distress.seed) < amount * .52 * (ref?.drop ?? 1);
            const fine = distress.enabled && hash(ix, iy, distress.seed + 127) < amount * .085 * (ref?.drop ?? 1);
            const drop = (coarse ? .18 : fine ? .56 : 1) * dropComp;
            const hm = clamp((halo - s * .3) * .62 * hiAlpha * (.88 + drop * .12), 0, .72);
            const bm = clamp((s * .38 + c * .52) * (.42 + tone * .58) * inkStrength * drop, 0, .96);
            const em = clamp(fuzzy * (.26 + edge.width * .08) * edgeAlpha * (ref?.edge ?? 1), 0, .58);
            r = lerp(lerp(lerp(clamp(r + paperTone * grainFactor), hiRgb.r, hm), inkRgb.r, bm), edgeRgb.r, em);
            g = lerp(lerp(lerp(clamp(g + paperTone * grainFactor), hiRgb.g, hm), inkRgb.g, bm), edgeRgb.g, em);
            b = lerp(lerp(lerp(clamp(b + paperTone * grainFactor), hiRgb.b, hm), inkRgb.b, bm), edgeRgb.b, em);
            const noise = textureStrength * Math.max(s, c, fuzzy) * (hash(ix, iy, 122) - .5)
              * ((texture.enabled ? texture.fabric : 0) * .82 + (decor.enabled ? decor.particles : 0) * .12) * grainFactor;
            const grain = distress.enabled ? (hash(Math.floor(ix / 2), Math.floor(iy / 2), distress.seed + 151) - .5) * (10 + distress.amount * 1.25) * Math.max(s, c) * grainFactor : 0;
            const scan = scanMap ? field(scanMap, sx, sy) * textureStrength * .34 * texture.scan / 100 * grainFactor : 0;
            r += noise + grain + scan; g += noise + grain + scan; b += noise + grain + scan;
            a = 255; // Thermal alpha is applied once, after all material/decor layers.
          } else if (preset === "penTrace") {
            r = clamp(r + paperTone); g = clamp(g + paperTone); b = clamp(b + paperTone);
            let line = edgeMap ? field(edgeMap, sx, sy) * .92 : 0;
            if (distress.enabled && hash(Math.floor(ix / cell), Math.floor(iy / cell), distress.seed) < distress.amount / 360) line *= .18;
            if (line > .05 && ink.enabled) {
              const mix = clamp(line * inkStrength * (.78 + hash(ix, iy, 91) * .32), 0, 1);
              r = lerp(r, lerp(inkRgb.r, edgeRgb.r, line * .35), mix);
              g = lerp(g, lerp(inkRgb.g, edgeRgb.g, line * .35), mix);
              b = lerp(b, lerp(inkRgb.b, edgeRgb.b, line * .35), mix);
              a = transparent ? clamp(line / .92, 0, 1) * 255 : 255;
            }
          } else {
            const e = edgeMap ? field(edgeMap, sx, sy) : 0;
            if (screenActive && m > .03) {
              const cx = sx - sw / 2, cy = sy - sh / 2;
              const rx = cx * cos - cy * sin, ry = cx * sin + cy * cos;
              const lx = ((rx % screenCell) + screenCell) % screenCell - half;
              const ly = ((ry % screenCell) + screenCell) % screenCell - half;
              const radius = screenCell * (.12 + tone * .52) * screen.strength / 100 * (.72 + m * .28);
              const aa = .5 / styleScale;
              m *= 1 - smoothstep(radius - aa, radius + aa, Math.hypot(lx, ly));
            }
            if (distress.enabled && m > .03 && textureStrength > .03 &&
              (hash(Math.floor(ix / cell), Math.floor(iy / cell), distress.seed) < amount * .18 || hash(ix, iy, distress.seed + 9) < (ink.enabled ? ink.holes : 0) / 100 * .08)) m = 0;
            if (transparent) r = g = b = 0;
            if (color.enabled && (!transparent || !directForeground)) { r = clamp(lerp(255, bgRgb.r, bgAlpha) + paperTone); g = clamp(lerp(255, bgRgb.g, bgAlpha) + paperTone); b = clamp(lerp(255, bgRgb.b, bgAlpha) + paperTone); }
            if (m > .03 && ink.enabled) {
              const ir = lerp(inkRgb.r, hiRgb.r, tone * .18 * hiAlpha), ig = lerp(inkRgb.g, hiRgb.g, tone * .18 * hiAlpha), ib = lerp(inkRgb.b, hiRgb.b, tone * .18 * hiAlpha);
              const noise = textureStrength * (hash(ix, iy, 4) - .5) * 48 * (texture.enabled ? texture.fabric / 100 : 0);
              r = (directForeground ? ir : lerp(r, ir, inkStrength * m)) + noise;
              g = (directForeground ? ig : lerp(g, ig, inkStrength * m)) + noise;
              b = (directForeground ? ib : lerp(b, ib, inkStrength * m)) + noise;
              a = transparent ? m * 255 : 255;
            }
            if (edge.enabled && e > 0) {
              const mix = (.62 + hash(Math.floor(ix / 3), Math.floor(iy / 3), 13) * edge.rough / 180) * edgeAlpha * e;
              r = lerp(r, edgeRgb.r, mix); g = lerp(g, edgeRgb.g, mix); b = lerp(b, edgeRgb.b, mix);
              a = transparent ? Math.max(a, e * 255) : 255;
            }
            if (texture.enabled) {
              const scan = transparent && a === 0 ? 0 : (scanMap ? field(scanMap, sx, sy) * textureStrength * .28 * texture.scan / 100 : 0);
              if (m > .03 && textureStrength > .03 && texture.bleed > 0) {
                r = lerp(r, inkRgb.r, texture.bleed / 100 * hash(ix, iy, 33) * .16 * m * textureStrength);
                g = lerp(g, inkRgb.g, texture.bleed / 100 * hash(ix, iy, 34) * .16 * m * textureStrength);
                b = lerp(b, inkRgb.b, texture.bleed / 100 * hash(ix, iy, 35) * .16 * m * textureStrength);
              }
              r += scan; g += scan; b += scan;
            }
          }
          d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b); d[i + 3] = clamp(a);
        }
      }
      targetCtx.putImageData(output, 0, top);
      onProgress(Math.round((top + rows) / oh * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (preset !== "thermalMap" && preset !== "penTrace" && decor.enabled && decor.blur > 0) {
      const bloom = document.createElement("canvas"); bloom.width = sw; bloom.height = sh;
      const ctx = bloom.getContext("2d"), image = ctx.createImageData(sw, sh);
      for (let p = 0; p < mask.length; p++) {
        const i = p * 4, strength = clamp(mask[p], 0, 1);
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 10;
        image.data[i + 3] = strength > .03 ? clamp((.12 + (255 - getLuma(source.data, i)) / 255 * .34) * decor.blur * 2.1 * strength) : 0;
      }
      ctx.putImageData(image, 0, 0);
      targetCtx.save(); targetCtx.globalAlpha = .8;
      targetCtx.filter = `blur(${Math.max(2, decor.blur * .32) * styleScale}px)`;
      targetCtx.drawImage(bloom, 0, 0, ow, oh); targetCtx.restore();
      bloom.width = bloom.height = 0;
    }
    if (decor.enabled && decor.grid > 0 && preset !== "penTrace") {
      targetCtx.save(); targetCtx.scale(ow / sw, oh / sh);
      targetCtx.globalAlpha = decor.grid / 100 * (preset === "thermalMap" ? .12 * grainFactor : .42);
      targetCtx.strokeStyle = "#111111"; targetCtx.lineWidth = 1;
      drawGrid(targetCtx, mask, sw, sh, Math.max(12, Number(decor.gridSize) || 48), clipDecor);
      targetCtx.restore();
    }
    if (transparent && preset === "thermalMap") {
      const alpha = createMaskAlphaCanvas(mask, sw, sh);
      targetCtx.save(); targetCtx.globalCompositeOperation = "destination-in";
      targetCtx.drawImage(alpha, 0, 0, ow, oh); targetCtx.restore();
      alpha.width = alpha.height = 0;
    }
    if (preset !== "thermalMap" && preset !== "penTrace" && decor.enabled && decor.particles > 0) {
      targetCtx.save(); targetCtx.scale(ow / sw, oh / sh); targetCtx.globalAlpha = .55; targetCtx.fillStyle = "#111111";
      for (let i = 0; i < Math.floor(decor.particles * 8); i++) {
        const x = Math.min(sw - 1, Math.floor(hash(i, 1, 91) * sw)), y = Math.min(sh - 1, Math.floor(hash(i, 2, 91) * sh));
        if (!(clipDecor ? mask[y * sw + x] > .08 : mask[y * sw + x] > .08 || hash(Math.floor(x / 28), Math.floor(y / 28), 93) > .72)) continue;
        targetCtx.beginPath(); targetCtx.arc(x, y, 1 + hash(i, 3, 91) * 2.8, 0, Math.PI * 2); targetCtx.fill();
      }
      targetCtx.restore();
    }
    return { width: ow, height: oh, mode: "native-material-redraw", styleSize };
  } finally { strip.width = strip.height = 0; }
}
