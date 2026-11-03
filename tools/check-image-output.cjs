const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'graphic-texture-demo.html'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, 'image-output-renderer.js'), 'utf8');
new Function(renderer);
const filenameContext = vm.createContext({
  Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
});
const filenameStart = html.indexOf('      const sourceFilenames = new WeakMap();');
const filenameEnd = html.indexOf('      const mobileImageOutput =', filenameStart);
assert(filenameStart >= 0 && filenameEnd > filenameStart);
vm.runInContext(html.slice(filenameStart, filenameEnd), filenameContext);
const nameFor = (name, suffix = 'penTrace-H-4K', extension = 'png') =>
  vm.runInContext(`createExportFilename(${JSON.stringify(name)}, ${JSON.stringify(suffix)}, ${JSON.stringify(extension)})`, filenameContext);
assert.match(nameFor('我的银杏.v2.JPG'), /^我的银杏\.v2_penTrace-H-4K_[a-z0-9]{5}\.png$/);
assert.match(nameFor('C:\\photos\\image.jpg'), /^image_penTrace/);
assert.match(nameFor(''), /^graphic-texture_penTrace/);
assert.match(nameFor('photo'), /^photo_penTrace/);
assert(!/[<>:"/\\|?*\u0000-\u001f]/.test(nameFor('a:b?c*<>.png')));
assert(nameFor('图'.repeat(400) + '.png').length < 150);
assert(nameFor('clip.mov', 'thermalMap-L-24fps', 'mp4').endsWith('.mp4'));
assert.equal(new Set(Array.from({ length: 1000 }, () => nameFor('same.png'))).size, 1000,
  'Rapid exports remain unique even with identical random values');
assert(html.includes('sourceFilename: file.name'), 'Successful imports retain original filenames');
assert(html.includes('createExportFilename(sourceFilenames.get(state.source), mobileImageOutput.filename)'),
  'Cached mobile image bytes get a fresh filename for every save');
assert(html.indexOf('const exportFilename = createExportFilename(') < html.indexOf('let outputMode = "legacy-scaling"'),
  'Async desktop exports freeze the filename with their preset before rendering');
const a = html.indexOf('      function fixedImageOutputSize()');
const b = html.indexOf('      function interactiveRenderSize()', a);
const state = { imageOutputSize:2048, imageResolution:720, imageExporting:false, size:1000, sourceAspect:.75, nodes:{color:{bg:'#f7f6f2'}} };
const sandbox = { state, window:{innerWidth:1440}, document:{documentElement:{dataset:{}}},
  lerp:(a,b,t)=>a+(b-a)*t, assert };
const savedPreferences=new Map();
sandbox.localStorage={getItem:key=>savedPreferences.get(key)||null,setItem:(key,value)=>savedPreferences.set(key,value)};
sandbox.location={search:''};sandbox.URLSearchParams=URLSearchParams;
vm.createContext(sandbox);
vm.runInContext(html.slice(html.indexOf('      function preferredImageOutputSize()'),a),sandbox);
assert.equal(vm.runInContext('preferredImageOutputSize()',sandbox),2048,'Fresh browsers default to 2K');
vm.runInContext(html.slice(a,b), sandbox);
const recipeState = JSON.stringify({quality:state.imageResolution,nodes:state.nodes});
assert.equal(vm.runInContext('fixedImageOutputSize()',sandbox),2048);
assert.equal(vm.runInContext('setImageOutputSize(4096)',sandbox),true);
assert.equal(savedPreferences.get('graphicTextureImageOutputSize'),'4096');
assert.equal(vm.runInContext('preferredImageOutputSize()',sandbox),4096,'Reload restores the saved resolution');
sandbox.location.search='?output=2k';assert.equal(vm.runInContext('preferredImageOutputSize()',sandbox),2048);
sandbox.location.search='';savedPreferences.set('graphicTextureImageOutputSize','123');
assert.equal(vm.runInContext('preferredImageOutputSize()',sandbox),2048,'Invalid storage falls back to 2K');
savedPreferences.set('graphicTextureImageOutputSize','4096');
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
const uiElements = Object.fromEntries(['outputControl','imageOutputMenu','exportPng','imageOutputSizeTrigger'].map(id => [id, {
  hidden:true, attrs:{}, classes:new Set(),
  setAttribute(name,value) { this.attrs[name]=value; },
  removeAttribute(name) { delete this.attrs[name]; },
  classList:{ toggle(name,value) { uiElements[id].classes[value?'add':'delete'](name); } }
}]));
const uiOptions = [2048,4096].map(size=>({disabled:false,dataset:{imageOutputSize:String(size)}}));
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
assert.equal(uiElements.imageOutputSizeTrigger.attrs['aria-expanded'],'true');
assert.equal(uiElements.imageOutputSizeTrigger.attrs['aria-haspopup'],'menu');
assert.equal(uiElements.exportPng.attrs['aria-haspopup'],undefined,'Main OUTPUT directly downloads, not a menu trigger');
assert.equal(uiElements.imageOutputSizeTrigger.textContent,'4K');
assert(uiOptions[1].hidden&&!uiOptions[0].hidden,'Only the alternate size appears above the current size');
state.imageOutputSize=2048;
vm.runInContext('syncImageOutputMenu()',sandbox);
assert.equal(uiElements.imageOutputSizeTrigger.textContent,'2K');
assert(uiOptions[0].hidden&&!uiOptions[1].hidden);
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
assert.equal(uiElements.imageOutputSizeTrigger.attrs['aria-haspopup'],undefined);
assert.equal(uiElements.imageOutputSizeTrigger.hidden,true);
for (const size of [2048,4096]) assert(html.includes(`data-image-output-size="${size}"`));
assert(/\.image-output-option\s*\{[^}]*height:\s*60px;/.test(html), 'Figma menu rows render at 48px with the 80% desktop UI scale');
assert(html.includes('linear-gradient(#ffffff66, #ffffff66)'), 'Figma hover is white at 40%');
assert(html.includes('linear-gradient(#00000033, #00000033)'), 'Figma pressed state is black at 20%');
assert(html.includes('querySelectorAll("button[data-image-output-size]")'),'Output selectors must exclude the html data-image-output-size state attribute');
const selectionHandler=html.slice(html.lastIndexOf('      document.querySelectorAll("button[data-image-output-size]").forEach((button) => {'),html.indexOf('      const randomizeButton ='));
assert(selectionHandler.includes('setImageOutputSize(')&&selectionHandler.includes('setImageOutputMenuOpen(false)'));
assert(!selectionHandler.includes('exportOutput(')&&!selectionHandler.includes('setImageExportBusy('),'Selecting a resolution is never an export or busy state');
console.log('PASS: unique source-based filenames, cached mobile saves, 2K/4K dimensions, independent style state, frozen size, native redraw, menu states and mobile/video compatibility');
