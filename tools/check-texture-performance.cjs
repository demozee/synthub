const fs = require('node:fs');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const html = fs.readFileSync(__dirname + '/graphic-texture-demo.html', 'utf8');
function extract(name) {
  const start = html.indexOf('      function ' + name + '(');
  const end = html.indexOf('\n      function ', start + 1);
  assert(start >= 0 && end > start);
  return html.slice(start, end);
}
const code = ['clamp','lerp','valueNoise','fractalNoise','paperTextureTone','getPaperToneMap','fillFractalNoiseRow'].map(extract).join('\n');
// hash's following declaration is not a function, so isolate its body explicitly.
const hash = html.slice(html.indexOf('      function hash('), html.indexOf('      function fastTemporalHash('));
const api = new Function(`let paperToneCache = {signature:'',maps:new Map()}; ${hash} ${code}; return {paperTextureTone,getPaperToneMap};`)();
let checked = 0;
for (const seed of [1, 121, 999]) for (const offset of [0, 173, -37])
for (const scan of [0, 21, 100]) for (const fabric of [0, 45, 100]) {
  const texture = {enabled:true, scan, fabric};
  const actual = api.getPaperToneMap(87, 63, texture, seed, offset);
  for (let y=0;y<63;y++) for(let x=0;x<87;x++) {
    assert.equal(actual[y*87+x], api.paperTextureTone(x+offset,y,texture,1,seed), `seed ${seed}, offset ${offset}, pixel ${x},${y}`);
    checked++;
  }
}
const texture = {enabled:true, scan:43, fabric:67};
const width=540,height=720;
const start=performance.now();
const original=new Float64Array(width*height);
for(let y=0;y<height;y++) for(let x=0;x<width;x++) original[y*width+x]=api.paperTextureTone(x,y,texture,1,121);
const baseline=performance.now()-start;
const optimizedStart=performance.now();
const optimized=api.getPaperToneMap(width,height,texture,121);
const optimizedMs=performance.now()-optimizedStart;
for (let i=0;i<original.length;i++) assert.equal(optimized[i],original[i],`pixel ${i}`);
console.log(JSON.stringify({exactSamples:checked+original.length,baselineMs:Math.round(baseline),optimizedMs:Math.round(optimizedMs),scope:'paper tone map only; not full frame'}));
