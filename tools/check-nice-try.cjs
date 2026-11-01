const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'graphic-texture-demo.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return html.slice(a, b);
}
let seed = 149182;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const scope = { assert, Math: math, console, TextEncoder, Uint8Array, btoa, atob, window: {innerWidth: 1440} };
vm.createContext(scope);
vm.runInContext(`
  ${section('      const presets = {', '      const state = {')}
  const state = { preset:'thermalMap', nodes:clone(presets.thermalMap.nodes), outputReverse:true,
    focusMelt:clone(focusMeltDefaults), imageResolution:1920, videoResolution:720, sourceAspect:.75 };
  const selectedOutputRenderSize = () => state.imageResolution;
  const clamp = (v,min=0,max=255) => Math.max(min,Math.min(max,v));
  ${section('      function hexToRgb(', '      function rgbToHex(')}
  ${section('      function encodeBase64Url(', '      function decodeLegacyRecipePayload(')}
  ${section('      function randInt(', '      function getUiColorAlpha(')}
  const history = [];
  const rememberNiceTryState = () => history.push({preset:state.preset,nodes:clone(state.nodes),outputReverse:state.outputReverse});
  let renders=0, scheduled=0;
  const renderAll = () => renders++;
  const scheduleNiceTryPreviewRender = () => scheduled++;
  const scheduleRecipeHistoryCommit = () => {};
  ${section('      function randomizeChain(', '      function presetIcon(')}
  const originalPresets = JSON.stringify(presets);
  for (const preset of Object.keys(presets)) {
    state.preset=preset; state.nodes=clone(presets[preset].nodes);
    const colors=new Set(), bases=new Set(), recipes=new Set(), directions=[];
    const extractionSamples={threshold:[],contrast:[],grayKeep:[]};
    for(let i=0;i<240;i++) {
      const previous=JSON.stringify(state.nodes);
      state.outputReverse=i%2===0;
      state.nodes.color.transparent=true; state.nodes.color.bgAlpha=0;
      state.nodes.ink.colorAlpha=73; state.nodes.edge.colorAlpha=61; state.nodes.color.highlightAlpha=85;
      randomizeChain(i%2===0);
      const n=state.nodes;
      for(const key of Object.keys(extractionSamples))extractionSamples[key].push(n.extract[key]);
      assert.equal(state.preset,preset,'Desktop explores within the current preset');
      assert.equal(state.outputReverse,i%2===0,'Preserve explicit RE');
      assert.equal(n.color.transparent,true); assert.equal(n.color.bgAlpha,0);
      assert.equal(n.ink.colorAlpha,73); assert.equal(n.edge.colorAlpha,61); assert.equal(n.color.highlightAlpha,85);
      assert.equal(state.imageResolution,1920); assert.equal(state.videoResolution,720);
      assert.equal(n.ink.color,n.edge.color); assert.equal(n.ink.color,n.color.highlight);
      assert(niceTryContrast(n.ink.color,n.color.bg)>=3.2,'Avoid low-contrast generated palettes');
      assert.notEqual(JSON.stringify(n),previous);
      for(const [id,node] of Object.entries(n)) {
        assert.equal(node.enabled,presets[preset].nodes[id].enabled,'Keep the preset effect identity');
        for(const [key,value] of Object.entries(node)) if(typeof value==='number') {
          const bounds=key==='threshold'?[0,255]:key==='angle'?[-45,45]:key==='dot'?[3,24]:key==='gridSize'?[18,96]:[0,100];
          assert(Number.isFinite(value)&&value>=bounds[0]&&value<=bounds[1],id+'.'+key+' in UI bounds');
        }
      }
      const direction=niceTryBags.get('material:'+preset).previous;
      assert.notEqual(direction,directions[directions.length-1]); directions.push(direction);
      if(i%4===3)assert.equal(new Set(directions.slice(-4)).size,4,'All four material directions visited');
      colors.add(n.ink.color); bases.add(n.color.bg); recipes.add(currentRecipeCode());
      const decoded=decodeRecipeBytes(recipeBytes());
      for(const id of recipeNodeOrder)for(const key of recipeNodeKeys[id]) {
        const expected=n[id][key] == null ? recipeDefaultValue(id,key,presets[preset].nodes[id]) : n[id][key];
        assert.equal(decoded.nodes[id][key],typeof expected==='string'?expected.toLowerCase():expected,'Generated recipes roundtrip');
      }
    }
    assert(colors.size>220); assert(bases.size>210); assert.equal(recipes.size,240);
    assert(Math.min(...extractionSamples.threshold)<90&&Math.max(...extractionSamples.threshold)>195,'Effective threshold exploration spans sparse and full shapes');
    assert(Math.min(...extractionSamples.contrast)<35&&Math.max(...extractionSamples.contrast)>90,'Effective contrast spans soft to hard extraction');
    assert(Math.min(...extractionSamples.grayKeep)<8&&Math.max(...extractionSamples.grayKeep)>65,'Effective gray retention spans binary to rich midtones');
    console.log('PASS '+preset+' extraction ranges: '+JSON.stringify(Object.fromEntries(Object.entries(extractionSamples).map(([key,values])=>[key,[Math.min(...values),Math.max(...values)]]))));
    const before=JSON.stringify([state.nodes.ink.color,state.nodes.edge.color,state.nodes.color]);
    randomizeChain(false,{preserveColors:true});
    assert.equal(JSON.stringify([state.nodes.ink.color,state.nodes.edge.color,state.nodes.color]),before);
    console.log('PASS '+preset+': '+colors.size+' graphic colors, '+bases.size+' base colors, 240 unique recipes, four material directions');
  }
  for(let i=0;i<16;i++) {
    const previous=state.preset;
    randomizeMobileEffect();
    assert.notEqual(state.preset,previous,'Mobile retains cross-preset exploration');
    assert.equal(history[history.length-1].preset,previous,'Undo must remember the preset before the mobile switch');
  }
  assert.equal(JSON.stringify(presets),originalPresets,'Approved preset defaults remain untouched');
  assert.equal(scheduled,480,'Desktop still schedules rendering for immediate feedback');
  console.log('PASS: 960 recipe roundtrips; RE/alpha/quality preserved; mobile undo and color lock; default presets unchanged');
  niceTryBags.clear(); niceTryPalettes.clear();
  const hueCounts=Array(12).fill(0), byMode={}, hueCycle=[];
  let chromaticCount=0, brightYellowGreen=0;
  function hueOf(hex) {
    const rgb=niceTryRgb(hex).map(v=>v/255), max=Math.max(...rgb), min=Math.min(...rgb), d=max-min;
    if(!d)return 0;
    const h=max===rgb[0]?(rgb[1]-rgb[2])/d:max===rgb[1]?2+(rgb[2]-rgb[0])/d:4+(rgb[0]-rgb[1])/d;
    return (h*60+360)%360;
  }
  for(let i=0;i<12000;i++) {
    const preset=Object.keys(presets)[i%4], palette=createNiceTryPalette(preset);
    const mode=niceTryBags.get('palette:'+preset).previous;
    assert(niceTryContrast(palette.graphic,palette.background)>=3.2,'Repaired grounds maintain contrast');
    if(mode==='mono')continue;
    const family=Math.floor(hueOf(palette.graphic)/30);
    assert.equal(family,niceTryBags.get('hue:chromatic').previous,'Contrast repair must not change the selected hue family');
    hueCounts[family]++; chromaticCount++; hueCycle.push(family);
    if(hueCycle.length===12) { assert.equal(new Set(hueCycle).size,12,'Each hue family visited before reuse, across preset switches'); hueCycle.length=0; }
    if(!byMode[mode])byMode[mode]=Array(12).fill(0);
    byMode[mode][family]++;
    if(mode==='bright'&&(family===2||family===3||family===4)) {
      const rgb=niceTryRgb(palette.graphic), lightness=(Math.max(...rgb)+Math.min(...rgb))/510;
      assert(lightness>=.435,'Yellow and green stay vivid, not darkened to olive for contrast');
      brightYellowGreen++;
    }
  }
  assert.equal(chromaticCount,10000);
  assert(Math.max(...hueCounts)-Math.min(...hueCounts)<=1,'Equal hue opportunity, not just unique hex values');
  for(const counts of Object.values(byMode))assert(Math.min(...counts)>85,'Every palette style must retain every hue family');
  assert(brightYellowGreen>350);
  console.log('PASS: 12,000 palettes, 10,000 chromatic hues across mobile preset switches: '+hueCounts.join(', '));
  console.log('PASS: vivid yellow/green retained; all palette styles cover the full hue wheel; contrast >=3.2');
`, scope);
