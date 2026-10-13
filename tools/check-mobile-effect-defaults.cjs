const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'graphic-texture-demo.html'), 'utf8');
const pen = fs.readFileSync(path.join(__dirname, 'pen-trace-contours.js'), 'utf8');
const state = {preset:'thermalMap',size:1000,previewSize:720,imageResolution:720,videoResolution:720,videoTuneSize:720,imageOutputSize:2048,source:{}};
let timer;
const scope = {state,window:{innerWidth:390,setTimeout:fn=>(timer=fn,1),clearTimeout(){}},
  isVideoSource:()=>false,isMobileCaptureSource:()=>false,cancelImageRefine(){},
  result:{width:720,height:720},setInputStatus(){},renderOutput:size=>{scope.rendered=size;}};
vm.createContext(scope);
vm.runInContext(pen,scope);
vm.runInContext(html.slice(html.indexOf('      function videoRenderSize()'),html.indexOf('      // Output pixels are independent')),scope);
vm.runInContext(html.slice(html.indexOf('      function scheduleImageRefine('),html.indexOf('      function cancelScheduledRenderOutput()')),scope);
const run = text=>vm.runInContext(text,scope);
for (const preset of ['thermalMap','penTrace']) {
  state.preset=preset;
  assert.equal(run('imageRenderSize()'),1920);
  assert.equal(run('fixedImageOutputSize()'),1000,'Phone output stays at the existing size');
  timer=null; run('scheduleImageRefine()'); assert.equal(typeof timer,'function');
  timer(); assert.equal(scope.rendered,1920,'Phone edits must refine back to final H');
}
assert(run('usesContinuousPenTrace(state.preset,imageRenderSize())'),'Phone Pen Trace uses multi-mask H');
for (const preset of ['dotShirt','xerox']) {
  state.preset=preset; assert.equal(run('imageRenderSize()'),1000);
}
scope.window.innerWidth=1440;
for (const preset of ['thermalMap','penTrace']) {
  state.preset=preset; assert.equal(run('imageRenderSize()'),720,'Published desktop L stays unchanged');
  assert.equal(run('videoRenderSize()'),720);
}
state.videoResolution=1080; assert.equal(run('videoRenderSize()'),1920,'Old Pen M recipes migrate to H');
state.videoResolution=1920; assert.equal(run('videoRenderSize()'),1920);
const nice = html.slice(html.indexOf('      function scheduleNiceTryPreviewRender()'),html.indexOf('      function cancelImageRefine()'));
assert(nice.includes('renderOutput(selectedOutputRenderSize())'),'NICE TRY finishes at the selected material quality');
assert(!nice.includes('window.innerWidth <= 640 ? interactiveRenderSize()'),'Phone NICE TRY cannot strand a coarse preview');
const prepare = html.slice(html.indexOf('      function prepareMobileImageOutput()'),html.indexOf('      async function shareMobileOutputFile('));
assert(prepare.includes('Math.max(result.width, result.height) !== imageRenderSize()'),'Only final-quality frames may be cached for mobile saving');
assert(prepare.includes('mobileImageOutput.blob = null'),'Temporary previews invalidate old prepared output');
scope.window.innerWidth=390;
state.sourceType='image'; state.preset='penTrace';
scope.mobileImageOutput={source:state.source,signature:'old',blob:{},generation:1};
scope.currentRecipeCode=()=> 'qa';
scope.mobileImageOutputSignature=()=> 'qa-h-1000';
vm.runInContext(prepare,scope);
run('prepareMobileImageOutput()');
assert.equal(scope.mobileImageOutput.blob,null);
assert.equal(scope.mobileImageOutput.signature,'');
scope.result.height=1920; timer=null; run('prepareMobileImageOutput()');
assert.equal(scope.mobileImageOutput.signature,'qa-h-1000');
assert.equal(typeof timer,'function','Final H creates a fresh prepared output');
const frameCache = html.slice(html.indexOf('      function canvasToFrameBlob('),html.indexOf('      async function drawCachedFrame('));
assert(frameCache.includes('"image/png"') && !frameCache.includes('"image/webp"'),'Video intermediate frames must be lossless');
console.log('PASS: mobile Thermal/Pen default H, final refinement, NICE TRY, unchanged 1000px output and published desktop L');
