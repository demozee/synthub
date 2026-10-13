const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'graphic-texture-demo.html'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, 'image-output-renderer.js'), 'utf8');
new Function(renderer);
const a = html.indexOf('      function fixedImageOutputSize()');
const b = html.indexOf('      function interactiveRenderSize()', a);
const state = { imageOutputSize:2048, imageResolution:720, imageExporting:false, size:1000, sourceAspect:.75, nodes:{color:{bg:'#f7f6f2'}} };
const sandbox = { state, window:{innerWidth:1440}, document:{documentElement:{dataset:{}}},
  lerp:(a,b,t)=>a+(b-a)*t, assert };
vm.createContext(sandbox);
vm.runInContext(html.slice(a,b), sandbox);
const recipeState = JSON.stringify({quality:state.imageResolution,nodes:state.nodes});
assert.equal(vm.runInContext('fixedImageOutputSize()',sandbox),2048);
assert.equal(vm.runInContext('setImageOutputSize(4096)',sandbox),true);
assert.equal(vm.runInContext('fixedImageOutputSize()',sandbox),4096);
assert.equal(vm.runInContext('fixedVideoOutputSize()',sandbox),1920);
assert.equal(vm.runInContext('setImageOutputSize(1920)',sandbox),false);
state.imageExporting=true;
assert.equal(vm.runInContext('setImageOutputSize(2048)',sandbox),false);
state.imageExporting=false;
assert.equal(JSON.stringify({quality:state.imageResolution,nodes:state.nodes}),recipeState,'Size must not mutate L/M/H or recipes');
for (const size of [2048,4096]) for (const aspect of [.75,1,16/9,9/16]) {
  sandbox.size=size; sandbox.aspect=aspect;
  const dims=vm.runInContext('fixedOutputDimensions(size,aspect)',sandbox);
  assert.equal(Math.max(dims.width,dims.height),size);
  assert(Math.abs(dims.width/dims.height-aspect)<.002);
}
sandbox.window.innerWidth=390;
assert.equal(vm.runInContext('fixedImageOutputSize()',sandbox),1000,'Mobile output behavior remains unchanged');
vm.runInContext(renderer.slice(0,renderer.indexOf('async function redrawStillImageOutput')),sandbox);
sandbox.field=new Float32Array([0,1,1,0]);
assert.equal(vm.runInContext('outputFieldSample(field,2,2,.5,.5)',sandbox),.5);
assert.equal(vm.runInContext('outputFieldSample(field,2,2,-1,-1)',sandbox),0);
assert(renderer.includes('const rowsPerStrip = 64'), 'Native output must use bounded strips');
assert(renderer.includes('new Float32Array(applyOutputReverseMask'), 'Style mask must be frozen before async output');
assert(html.includes('redrawStillImageOutput(imageExportCanvas'), 'PNG output must use material redraw, not only final-image scaling');
const uiElements = Object.fromEntries(['outputControl','imageOutputMenu','exportPng'].map(id => [id, {
  hidden:true, attrs:{}, classes:new Set(),
  setAttribute(name,value) { this.attrs[name]=value; },
  removeAttribute(name) { delete this.attrs[name]; },
  classList:{ toggle(name,value) { uiElements[id].classes[value?'add':'delete'](name); } }
}]));
const uiOptions = [{disabled:false},{disabled:false}];
sandbox.document.getElementById = id => uiElements[id];
sandbox.document.querySelectorAll = () => uiOptions;
sandbox.isVideoSource = () => Boolean(state.video);
sandbox.window.innerWidth=1280;
state.source={}; state.videoExporting=false;
const uiStart=html.indexOf('      function setImageOutputMenuOpen(');
const uiEnd=html.indexOf('      function releaseVideoRenderPause()',uiStart);
vm.runInContext(html.slice(uiStart,uiEnd),sandbox);
vm.runInContext('syncImageOutputMenu(); setImageOutputMenuOpen(true)',sandbox);
assert.equal(uiElements.imageOutputMenu.hidden,false);
assert.equal(uiElements.exportPng.attrs['aria-expanded'],'true');
assert.equal(uiElements.exportPng.attrs['aria-haspopup'],'menu');
for (const [key,value] of [['imageExporting',true],['videoExporting',true],['video',true],['source',null]]) {
  const previous=state[key]; state[key]=value;
  vm.runInContext('syncImageOutputMenu(); setImageOutputMenuOpen(true)',sandbox);
  assert.equal(uiElements.imageOutputMenu.hidden,true,`Menu blocked while ${key}`);
  assert(uiOptions.every(button=>button.disabled));
  state[key]=previous;
}
sandbox.window.innerWidth=390;
vm.runInContext('syncImageOutputMenu(); setImageOutputMenuOpen(true)',sandbox);
assert.equal(uiElements.imageOutputMenu.hidden,true,'Desktop menu stays hidden on mobile');
assert.equal(uiElements.exportPng.attrs['aria-haspopup'],undefined);
for (const size of [2048,4096]) assert(html.includes(`data-image-output-size="${size}"`));
assert(/\.image-output-option\s*\{[^}]*height:\s*60px;/.test(html), 'Figma menu rows render at 48px with the 80% desktop UI scale');
assert(html.includes('linear-gradient(#ffffff66, #ffffff66)'), 'Figma hover is white at 40%');
assert(html.includes('linear-gradient(#00000033, #00000033)'), 'Figma pressed state is black at 20%');
console.log('PASS: 2K/4K dimensions, independent style state, frozen size, native redraw, menu states and mobile/video compatibility');
