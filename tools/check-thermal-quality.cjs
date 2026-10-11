const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'graphic-texture-demo.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert(a >= 0 && b > a, `Missing source section: ${start}`);
  return html.slice(a, b);
}
function fixture(quality, override) {
  const ctx = { Uint8ClampedArray, Float32Array, quality, override, result: {}, captured: null };
  vm.createContext(ctx);
  vm.runInContext(`
    ${section('      const presets = {', '      const state = {')}
    const state = {nodes:clone(presets.thermalMap.nodes)};
    const nodesBefore = JSON.stringify(state.nodes);
    const staticRenderFrameContext = {};
    const selectedOutputRenderSize = () => quality;
    const clamp = (n,min=0,max=255) => Math.max(min,Math.min(max,n));
    const lerp = (a,b,t) => a+(b-a)*t;
    const hexToRgb = s => ({r:parseInt(s.slice(1,3),16),g:parseInt(s.slice(3,5),16),b:parseInt(s.slice(5,7),16)});
    const getColorAlpha = () => 100;
    const isTransparentOutput = () => false;
    const shouldClipDecorToMask = () => false;
    const createMaskAlphaCanvas = () => null;
    // Deterministic masks isolate the compositor from platform-specific blur rasterization.
    const getBlurredMaskData = (mask,w,h,radius) => {
      const a=new Uint8ClampedArray(w*h*4);
      for(let p=0;p<mask.length;p++) a[p*4+3]=mask[p]*255;
      return a;
    };
    const getRenderBuffers = (w,h) => ({output:{data:new Uint8ClampedArray(w*h*4)}});
    const getPaperToneMap = () => null;
    const createTemporalToneSample = () => ({});
    const sampleTemporalToneMap = () => 0;
    const temporalHash = (x,y,seed) => (Math.sin(x*19+y*37+seed)*12345)%1/2+0.5;
    const temporalThresholdHit = (x,y,seed,threshold) => temporalHash(x,y,seed)<threshold;
    const getLuma = (d,i) => d[i]*.299+d[i+1]*.587+d[i+2]*.114;
    const syncResultFit = () => {};
    const drawGrid = () => {};
    const clipResultAlphaToMask = () => {};
    const resultCtx = {putImageData:out=>{captured=Array.from(out.data)},save(){},restore(){}};
    ${section('      function thermalQualityRefinement(', '      function drawGrid(')}
  `, ctx);
  ctx.source = { data: new Uint8ClampedArray(32 * 32 * 4) };
  ctx.mask = new Float32Array(32 * 32);
  for (let p = 0; p < ctx.mask.length; p++) {
    ctx.mask[p] = (p % 32) / 31;
    ctx.source.data[p * 4] = p % 255;
    ctx.source.data[p * 4 + 1] = (p * 3) % 255;
    ctx.source.data[p * 4 + 2] = (p * 7) % 255;
    ctx.source.data[p * 4 + 3] = 255;
  }
  vm.runInContext('renderThermalMap(source,mask,32,32,mask,{},override)', ctx);
  assert(vm.runInContext('JSON.stringify(state.nodes) === nodesBefore', ctx), 'Quality must not mutate preset/color parameters');
  return { pixels: Array.from(ctx.captured), ctx };
}
const low = fixture(720);
const hash = crypto.createHash('sha256').update(Uint8Array.from(low.pixels)).digest('hex');
// Golden compositor output generated from the pre-v2.7 renderer (4425f71).
assert.equal(hash, 'b3aca57efe8f4467795571d621a8ffd2b3051d656212f30974344628d7f738fc', 'L must retain its established output');
assert.deepEqual(low.pixels, fixture(720, null).pixels);
assert.equal(vm.runInContext('thermalQualityRefinement(720)', low.ctx), null);
for (const quality of [1080, 1920]) {
  const rendered = fixture(quality);
  const fine = quality === 1920 ? 1 : .6;
  const lerp = (a,b,t) => a+(b-a)*t;
  const approvedProfile = {
    focus: lerp(1, lerp(.75,.30,68/100), fine), soft: lerp(1,.72,fine),
    glow: 1, tone: 1, grain: lerp(1,.04+30/180,fine),
    drop: Math.pow(1-fine,2), edge: lerp(1,.12,fine),
  };
  assert.deepEqual(rendered.pixels, fixture(quality, approvedProfile).pixels, 'Published profile must match the approved study defaults');
  assert.notDeepEqual(rendered.pixels, low.pixels, 'M/H must refine the material');
}
assert(!html.includes('studyScript.src'), 'Local study loader must not ship');
console.log('PASS: unchanged L golden output, approved M/H profiles, unchanged preset/colors, local-study exclusion');
