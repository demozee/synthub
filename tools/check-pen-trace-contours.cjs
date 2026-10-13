const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {execFileSync}=require('node:child_process');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const html = fs.readFileSync(path.join(__dirname,'graphic-texture-demo.html'),'utf8');
const code = fs.readFileSync(path.join(__dirname,'pen-trace-contours.js'),'utf8');
const renderer = fs.readFileSync(path.join(__dirname,'image-output-renderer.js'),'utf8');
new Function(code);
const scope = {console,Float32Array,Map,Set,Math,
  lerp:(a,b,t)=>a+(b-a)*t,
  hexToRgb:s=>({r:parseInt(s.slice(1,3),16),g:parseInt(s.slice(3,5),16),b:parseInt(s.slice(5,7),16)}),
  getColorAlpha:()=>100};
vm.createContext(scope); vm.runInContext(code,scope);
assert(!scope.usesContinuousPenTrace('penTrace',720),'L uses the published raster pen renderer');
assert(!scope.usesContinuousPenTrace('penTrace',1080),'Retired M must not invoke the study renderer');
assert(scope.usesContinuousPenTrace('penTrace',1920));
assert.equal(scope.normalizeEffectResolution('penTrace',1080),1920,'Old M recipes migrate to H');
assert.equal(scope.normalizeEffectResolution('penTrace',720),720);
assert.equal(scope.normalizeEffectResolution('thermalMap',1080),1080,'Other preset quality controls stay unchanged');
assert(!scope.usesContinuousPenTrace('penTrace',1000),'Unrequested mobile capture path stays unchanged');
assert(!scope.usesContinuousPenTrace('thermalMap',1920));
const width=120,height=120,mask=new Float32Array(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const r=Math.hypot(x-60,y-60);
  if(r<38 && r>12)mask[y*width+x]=1;
}
mask[5*width+5]=mask[6*width+6]=1;
const saved=Buffer.from(mask.buffer).toString('base64');
const contours=scope.createPenTraceContours(mask,width,height);
assert.equal(contours.length,2,'Keep the outer outline and inner hole, reject isolated dots');
assert.equal(Buffer.from(mask.buffer).toString('base64'),saved,'Never mutate the source mask');
for(const points of contours) {
  assert(points.length>40);
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    assert(Number.isFinite(a.x)&&Number.isFinite(a.y));
    assert(Math.hypot(a.x-b.x,a.y-b.y)<2,'No disconnected jumps within an outline');
  }
}
function draw(nodes,transparent=false,quality=1920) {
  const commands=[];
  const ctx=new Proxy({}, {get:(obj,key)=>key in obj ? obj[key] : (...args)=>commands.push([key,...args]),
    set:(obj,key,value)=>{obj[key]=value;commands.push([key,value]);return true;}});
  scope.drawContinuousPenTrace(ctx,contours,width,height,nodes,transparent,quality);
  return commands;
}
const nodes={ink:{enabled:true,color:'#5a3b22',strength:92},edge:{enabled:true,width:1,color:'#1d2b3e'},color:{bg:'#f7f6f2'},distress:{enabled:true,amount:90,seed:2},texture:{enabled:true,fabric:100}};
const commands=draw(nodes);
assert.equal(digest(JSON.stringify(commands)),'8c9d2d2fc4a8d105e34974ed74d340339ce33718f85812ddb083b186de92dd18','Approved H paint commands must not change');
assert.equal(commands.filter(c=>c[0]==='closePath').length,2);
assert.equal(commands.filter(c=>c[0]==='stroke').length,1);
assert(!commands.some(c=>c[0]==='arc'),'No dot rendering in H');
assert(!draw(nodes,true).some(c=>c[0]==='fillRect'),'Transparent output has no paper/background layer');
assert.deepEqual(draw({...nodes,distress:{enabled:true,amount:0,seed:999},texture:{enabled:false,fabric:0}}),commands,'Noise controls cannot introduce speckle or broken lines in H');
const solid=new Float32Array(width*height),source={width,height,data:new Uint8ClampedArray(width*height*4)};
for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const p=y*width+x,i=p*4;
  solid[p]=Math.hypot(x-60,y-60)<38?1:0;
  source.data[i]=source.data[i+1]=source.data[i+2]=Math.round(30+200*x/width);
  source.data[i+3]=255;
}
nodes.extract={threshold:142};
const nodesBefore=JSON.stringify(nodes);
const layers=scope.createPenTraceStructure(source,solid,width,height,nodes);
assert.equal(digest(JSON.stringify(layers.map(p=>({points:Array.from(p),closed:p.closed,layer:p.layer})))),'282cbfac852d5cf4721d6478d08400b207b2f0d2ff4bbd3dc3f2ceb9caa1710a','Approved H path geometry must remain exact');
assert(layers.stats.structure>0,'Internal boundaries must be detected even when the subject mask is a solid silhouette');
const printNodes={...nodes,edge:{...nodes.edge,rough:72},texture:{enabled:true,fabric:18},distress:{...nodes.distress,amount:30}};
const print=scope.createPenTracePrintTexture(source,solid,width,height,printNodes,layers);
assert(print.fill.length>0&&print.edge.length>0,'H supports both clustered print texture and local edge fibers');
assert(!code.includes('const ordered='),'H material must not retain a Bayer screen or fixed print lattice');
assert(print.fill.some(p=>p.kind==='grain')&&print.fill.some(p=>p.kind==='fiber'),'Irregular flecks and occasional fibers are separate material marks');
assert(print.fill.some(p=>p.hole),'Some larger flecks retain real negative-space pinholes');
const radii=print.fill.filter(p=>p.kind==='grain').map(p=>p.radius);
assert(Math.max(...radii)>Math.min(...radii)*4,'Particle sizes vary instead of using a uniform dot radius');
assert(print.fill.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.radius)));
assert.equal(JSON.stringify(print),JSON.stringify(scope.createPenTracePrintTexture(source,solid,width,height,printNodes,layers)),'Print marks must be stable for the same recipe');
assert.notEqual(JSON.stringify(print),JSON.stringify(scope.createPenTracePrintTexture(source,solid,width,height,{...printNodes,distress:{...printNodes.distress,seed:23}},layers)),'A new recipe may change ink islands, without frame-to-frame randomness');
assert(print.fill.filter(p=>p.x<width/2).length>print.fill.filter(p=>p.x>width/2).length,'Darker source regions get denser texture, not a uniform overlay');
assert(print.fill.every(p=>solid[Math.round(p.y)*width+Math.round(p.x)]>.08),'Interior print texture is gated by the selected mask');
const noPrint=scope.createPenTracePrintTexture(source,solid,width,height,{...printNodes,texture:{enabled:false,fabric:18}},layers);
assert.equal(noPrint.fill.length,0,'Print Texture off removes internal print marks');
assert(noPrint.edge.length>0,'Print toggle does not remove independently controlled edge fibers');
const cleanEdge=scope.createPenTracePrintTexture(source,solid,width,height,{...printNodes,distress:{...printNodes.distress,enabled:false}},layers);
assert.equal(cleanEdge.edge.length,0,'Distress Grain off removes edge fibers');
assert(cleanEdge.fill.length>0,'Grain toggle leaves independently controlled internal texture');
const largerEdge=scope.createPenTracePrintTexture(source,solid,width,height,{...printNodes,distress:{...printNodes.distress,size:12}},layers);
assert.notEqual(JSON.stringify(largerEdge.edge),JSON.stringify(print.edge),'The existing Grain Size control affects local edge fragments');
assert.equal(JSON.stringify(largerEdge.fill),JSON.stringify(print.fill),'Grain Size must not alter independently controlled print fill');
assert(layers.stats.maskLayers>=4 && layers.stats.maskLayers<=5);
assert(layers.some(p=>p.layer==='structure' && p.closed===false),'Internal paths are allowed to remain open, not forced into fake loops');
const same=scope.createPenTraceStructure(source,solid,width,height,nodes);
assert.equal(JSON.stringify(layers),JSON.stringify(same),'The same recipe must reproduce exactly the same paths');
const other=scope.createPenTraceStructure(source,solid,width,height,{...nodes,distress:{...nodes.distress,seed:20}});
assert.notEqual(JSON.stringify(layers),JSON.stringify(other),'Recipe seed must vary threshold combinations, not add pixel noise');
assert.equal(JSON.stringify(nodes),nodesBefore,'Multi-mask computation must not mutate palette or effect settings');
const flat={...source,data:new Uint8ClampedArray(source.data)};
for(let i=0;i<flat.data.length;i+=4)flat.data[i]=flat.data[i+1]=flat.data[i+2]=180;
const flatLayers=scope.createPenTraceStructure(flat,solid,width,height,nodes);
assert.equal(flatLayers.stats.structure+flatLayers.stats.detail,0,'No fabricated detail in a flat region');
const haloSource={...source,data:new Uint8ClampedArray(source.data)};
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,tone=Math.hypot(x-60,y-60)<35?25:100;
  haloSource.data[i]=haloSource.data[i+1]=haloSource.data[i+2]=tone;
}
const lHalo=scope.createPenTraceStructure(haloSource,solid,width,height,nodes,false,720);
const mHalo=scope.createPenTraceStructure(haloSource,solid,width,height,nodes,false,1080);
assert.equal(lHalo.stats.structure,0,'L rejects a close threshold halo instead of drawing a parallel outline');
assert(mHalo.stats.structure>0,'L boundary deduplication must not alter M extraction');
const rectangle=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
assert(scope.isPenTraceCanvasFrame(rectangle(.3,.3,119,119),120,120),'Reject the zero-padded canvas outline');
assert(scope.isPenTraceCanvasFrame(rectangle(12,12,696,1056),720,1080),'Reject an inset frame from a smoothed mask');
assert(!scope.isPenTraceCanvasFrame(rectangle(20,20,80,80),120,120),'Keep a real rectangular subject away from the canvas boundary');
assert(!scope.isPenTraceCanvasFrame(rectangle(0,30,100,80),120,120),'A subject touching only one edge is not a canvas frame');
const mixed=[{x:0,y:0},{x:120,y:0},{x:120,y:120},{x:80,y:120},{x:70,y:90},{x:40,y:60},{x:0,y:80}];
mixed.closed=true;mixed.layer='outline';
const cropped=scope.stripPenTraceCanvasEdges(Object.assign([mixed],{stats:{maskLayers:1}}),120,120);
assert.equal(cropped.length,1,'Keep the subject when its contour connects to the canvas perimeter');
assert.equal(cropped[0].closed,false,'Do not reconnect clipped canvas edges into a new frame');
assert(cropped[0].some(p=>p.x===40&&p.y===60),'Preserve the actual subject curve');
assert(!cropped[0].some(p=>p.x===120&&p.y===0),'Remove only artificial perimeter segments');
const backgroundMask=new Float32Array(solid.length);
for(let i=0;i<solid.length;i++)backgroundMask[i]=1-solid[i];
for(const quality of [720,1080,1920]){
  const borderless=scope.createPenTraceStructure(flat,backgroundMask,width,height,nodes,true,quality);
  assert.equal(borderless.stats.outline,1,'Remove only the outer canvas rectangle; retain the subject hole outline');
  assert(borderless.every(p=>!scope.isPenTraceCanvasFrame(p,width,height)),'No mask layer may reintroduce a canvas frame');
}
for(const quality of [720,1080]) {
  const graded=scope.createPenTraceStructure(source,solid,width,height,nodes,false,quality);
  assert.equal(graded.printTexture,undefined,'This H-only texture study must not alter L/M');
  assert(graded.stats.structure>0,'L/M must also retain internal structure');
  assert(graded.stats.maskLayers>=4,'L/M must use multiple masks, not silhouette-only rendering');
  const painted=draw(nodes,true,quality);
  if(quality===720){
    assert.equal(painted.filter(c=>c[0]==='fill').length,1,'All L ink is one fill, so joints and crossings cannot accumulate opacity');
    assert(!painted.some(c=>c[0]==='stroke'||c[0]==='filter'),'L roughness is geometry, not marker overdraw or blur');
    assert(painted.filter(c=>c[0]==='lineTo').length>100,'Fine edge variation follows the detected lines');
  }else assert(painted.some(c=>c[0]==='fill'),'M keeps its connected variable-width ink ribbons');
  assert(!painted.some(c=>c[0]==='arc'||c[0]==='fillRect'),'No speckle dots or paper layer');
  assert.deepEqual(painted,draw(nodes,true,quality),'Pressure variation is reproducible');
  assert.deepEqual(painted,draw({...nodes,distress:{...nodes.distress,amount:0},texture:{enabled:false,fabric:0}},true,quality),'Noise amount and paper controls must not affect L/M pen strokes');
  assert.notDeepEqual(painted,draw({...nodes,distress:{...nodes.distress,seed:23}},true,quality),'Seed varies smooth pen pressure');
}
assert(scope.penTraceQualityProfile(720).outlineWidth<2,'L uses a fine hand-drawn line, not a broad chisel nib');
assert(scope.penTraceQualityProfile(1080).outlineWidth>scope.penTraceQualityProfile(1920).outlineWidth);
assert(scope.penTraceQualityProfile(720).handDrawn,'L uses dry hand-drawn edge geometry');
assert(!scope.penTraceQualityProfile(1080).handDrawn);
const penBefore=JSON.stringify(contours);
const ribbon=scope.createHandDrawnPenRibbon(contours[0],1.5,18);
assert(ribbon.length>100&&ribbon.closed);
assert.equal(JSON.stringify(contours),penBefore,'Dry edge geometry cannot change detected image structure');
assert.equal(JSON.stringify(ribbon),JSON.stringify(scope.createHandDrawnPenRibbon(contours[0],1.5,18)),'Hand-drawn edges must reproduce from the recipe seed');
assert(ribbon.every(s=>[s.left,s.right].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
const widths=ribbon.map(s=>Math.hypot(s.left.x-s.right.x,s.left.y-s.right.y));
assert(Math.max(...widths)-Math.min(...widths)>.3,'Fine dry bites vary the edge without opacity changes');
assert(Math.max(...widths)<3.3,'Localized ink knots must remain fine rather than broad marker patches');
assert(ribbon.some(p=>p.cluster<.02)&&ribbon.some(p=>p.cluster>.18),'Clean stretches alternate with localized rough ink patches');
assert(ribbon.flecks.length>0&&ribbon.flecks.length<ribbon.length*.1,'Fibers are sparse and clustered, not a uniform dotted edge');
assert(renderer.includes('createPenTraceStructure(source, mask, sw, sh, nodes'), 'Output must use exactly the same multi-mask path builder');
// Keep the legacy fallback intact for capture paths outside the desktop L/M/H controls.
function penSection(text) {return text.slice(text.indexOf('      function renderPenTrace('),text.indexOf('      function createMaskAlphaCanvas('));}
const currentLegacy=penSection(html).replace(/        if \(usesContinuousPenTrace[\s\S]*?          return;\n        }\n/,'');
// Golden checks from published v2.7 remain valid after this change is committed.
assert.equal(digest(currentLegacy),'7f785ddb3d728e9586b5c5b7415f45a0ace13708057246424fec6024cf1d682a','Legacy fallback must stay byte-identical');
const published=execFileSync('git',['show','657b2e2:tools/graphic-texture-demo.html'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
assert.equal(currentLegacy,penSection(published),'L renderer must be exactly the published v2.7 code');
const edgeSection=text=>text.slice(text.indexOf('      function edgeAt('),text.indexOf('      function analyzeMaskGeometry('));
assert.equal(edgeSection(html),edgeSection(published),'Published L rough-edge mask and edge detection must remain exact');
function maskFixture(text,quality,noise,preset='penTrace') {
  const count=32*32,source={width:32,height:32,data:new Uint8ClampedArray(count*4)};
  for(let i=0;i<count;i++){source.data[i*4]=source.data[i*4+1]=source.data[i*4+2]=100+i%64;source.data[i*4+3]=255;}
  const testScope={state:{preset,sourceHasTransparency:false,nodes:{extract:{enabled:true,contrast:38,threshold:142,grayKeep:0,invert:false}}},
    getRenderBuffers:()=>({baseMask:new Float32Array(count),maskNoise:new Float32Array(count).fill(noise)}),
    selectedOutputRenderSize:()=>quality,usesContinuousPenTrace:scope.usesContinuousPenTrace,
    analyzeOpaqueBackground:()=>null,renderingVideoBatch:false,isMotionSource:()=>false,
    document:{documentElement:{dataset:{}}},getLuma:(d,i)=>d[i],clamp:(n,a=0,b=255)=>Math.max(a,Math.min(b,n))};
  vm.createContext(testScope);
  vm.runInContext(text.slice(text.indexOf('      function createMask(source)'),text.indexOf('      function edgeAt(')),testScope);
  return Buffer.from(testScope.createMask(source).buffer);
}
for(const quality of [720,1080,1920]) {
  assert.equal(digest(maskFixture(html,quality,.7,'thermalMap')),'756e4508e86c06ca3bf704e3adab38ff1975625c75f65579d02b63d51070064f','Other presets must not change');
  if(quality>=1920)assert.deepEqual(maskFixture(html,quality,0),maskFixture(html,quality,1),'H keeps clean multi-mask extraction');
  else for(const noise of [0,.7,1])assert.deepEqual(maskFixture(html,quality,noise),maskFixture(published,quality,noise),'L must use published mask threshold noise exactly');
}
assert(html.includes('button.hidden = state.preset === "penTrace" && resolution === 1080'),'Only Pen Trace hides M');
assert(html.includes('.video-quality-option[hidden]'),'Hidden M cannot be exposed by button display CSS');
assert(renderer.includes('drawContinuousPenTrace(targetCtx'), 'Native output must redraw the same connected paths');
assert(renderer.includes('mode:"continuous-pen-paths"'));
console.log('PASS: published v2.7 L renderer/mask restored exactly, H geometry/material preserved, Pen Trace L/H controls, old M recipe migration, shared export');
