const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'graphic-texture-demo.html'), 'utf8');
new Function(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
function section(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert(a >= 0 && b > a, `Missing source section: ${start}`);
  return html.slice(a, b);
}
assert(!html.includes('highlightPoints'), 'Experimental preset must not ship');
assert(!html.includes('function applyFocusMeltToOutput'), 'Blur renderer must not ship');
assert(!html.includes('id="focusOverlay"'), 'Blur overlay must not ship');
const niceTry = section('      function scheduleNiceTryPreviewRender()', '      function cancelImageRefine()');
assert(niceTry.includes('selectedOutputRenderSize()'));
assert(!niceTry.includes('scheduleImageRefine('));
assert(!niceTry.includes('scheduleVideoFrameRefine('));
const sandbox = { assert, Uint8Array, TextEncoder, btoa, atob, window: { innerWidth: 1440 } };
vm.createContext(sandbox);
vm.runInContext(`
  ${section('      const presets = {', '      const state = {')}
  const state = { preset: 'thermalMap', nodes: clone(presets.thermalMap.nodes),
    outputReverse: false, focusMelt: clone(focusMeltDefaults), sourceAspect: 0.75 };
  let quality = 720;
  const selectedOutputRenderSize = () => quality;
  const clamp = (v, min = 0, max = 255) => Math.max(min, Math.min(max, v));
  ${section('      function hexToRgb(', '      function rgbToHex(')}
  ${section('      function encodeBase64Url(', '      function decodeLegacyRecipePayload(')}
  ${section('      function fixedOutputDimensions(', '      function drawFixedOutput(')}
  let cases = 0;
  for (const preset of Object.keys(presets)) {
    state.preset = preset;
    state.nodes = clone(presets[preset].nodes);
    const codes = new Set();
    for (quality of [720, 1080, 1920]) {
      const bytes = recipeBytes();
      const decoded = decodeRecipeBytes(bytes);
      assert.equal(decoded.effectResolution, quality);
      assert.equal(decoded.preset, preset);
      assert.equal(decoded.focusMelt.enabled, false);
      for (const id of recipeNodeOrder) for (const key of recipeNodeKeys[id]) {
        const expected = state.nodes[id][key] ?? recipeDefaultValue(id, key, presets[preset].nodes[id]);
        assert.equal(decoded.nodes[id][key], typeof expected === 'string' ? expected.toLowerCase() : expected);
      }
      const gt2 = bytes.slice(0, -17); gt2[0] = 2;
      const gt3 = bytes.slice(0, -1); gt3[0] = 3;
      assert.equal(decodeRecipeBytes(gt2).preset, preset);
      assert.equal(decodeRecipeBytes(gt3).preset, preset);
      assert.equal(decodeRecipeBytes(bytes.slice(0, -1)), null);
      codes.add(currentRecipeCode());
      cases++;
    }
    assert.equal(codes.size, 3, 'Every quality has its own code');
  }
  for (const aspect of [0.75, 1, 16/9, 9/16]) {
    const dims = fixedOutputDimensions(1920, aspect);
    assert.equal(Math.max(dims.width, dims.height), 1920);
    assert(Math.abs(dims.width / dims.height - aspect) < 0.005);
    const video = fixedOutputDimensions(1920, aspect, true);
    assert.equal(video.width % 2, 0); assert.equal(video.height % 2, 0);
  }
  assert.equal(cases, 12);
  window.innerWidth = 390;
  assert(currentRecipeCode().startsWith('GT2-'), 'Mobile retains its legacy code format');
`, sandbox);
for (const match of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"?#]+)"/g)) {
  assert(fs.existsSync(path.resolve(__dirname, match[1])), `Missing asset ${match[1]}`);
}
console.log('PASS: syntax, release exclusions, 12 recipe/quality roundtrips, GT2/GT3 compatibility, output dimensions, static assets');
