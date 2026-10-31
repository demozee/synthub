const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'graphic-texture-demo.html'),'utf8');
function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start);return html.slice(start,end);}
const scope={assert};vm.createContext(scope);
vm.runInContext(`
${section('      const presets = {','      const state = {')}
const state={preset:'penTrace',nodes:clone(presets.penTrace.nodes),selected:'ink'};
let quality=720,remembered=0,renders=0;
const selectedOutputRenderSize=()=>quality;
const usesContinuousPenTrace=(preset,q)=>preset==='penTrace'&&q>=1920;
const rememberNiceTryState=()=>remembered++;
const renderAll=()=>renders++;
${section('      function effectUiMeta(','      function renderNodeList(')}
${section('      function controlRange(','      function controlColor(')}
for(const preset of Object.keys(presets)) {
 state.preset=preset;state.nodes=clone(presets[preset].nodes);
 for(quality of [720,1920])for(const node of nodeMeta){
   const unsupported=(preset==='penTrace'&&['screen','decor'].includes(node.id))||(preset==='thermalMap'&&node.id==='screen');
   assert.equal(effectUiMeta(node.id).available,!unsupported);
   if(unsupported){const before=JSON.stringify(state.nodes),count=remembered;toggleEffectNode(node.id);assert.equal(JSON.stringify(state.nodes),before);assert.equal(remembered,count);}
 }
}
state.preset='penTrace';state.nodes=clone(presets.penTrace.nodes);state.selected='ink';
assert.equal(effectUiMeta('ink').name,'Line Ink');
assert.equal(controlRange('Dropouts','holes',0,100),'');
assert(controlRange('Fill','strength',0,100).includes('线条着墨'));
state.selected='texture';quality=1920;
assert.equal(effectUiMeta('texture').name,'Print Shading');
assert.equal(controlRange('Scan','scan',0,100),'');
assert.equal(controlRange('Bleed','bleed',0,100),'');
assert(controlRange('Fabric','fabric',0,100).includes('结构排纹'));
quality=720;assert.equal(effectUiMeta('texture').name,'Paper Texture');assert(controlRange('Scan','scan',0,100));
state.sourceHasTransparency=true;
assert(!effectUiMeta('extract').available,'Alpha outlines do not use luminance extraction');
quality=1920;assert(effectUiMeta('extract').available);assert.deepEqual(effectUiMeta('extract').keys,['threshold']);
state.sourceHasTransparency=false;
state.preset='xerox';state.nodes=clone(presets.xerox.nodes);
toggleEffectNode('screen');assert(state.nodes.screen.enabled);assert.equal(state.nodes.screen.strength,80);
toggleEffectNode('screen');assert(!state.nodes.screen.enabled);toggleEffectNode('screen');assert.equal(state.nodes.screen.strength,80);
toggleEffectNode('decor');assert(state.nodes.decor.enabled);assert(state.nodes.decor.grid+state.nodes.decor.blur+state.nodes.decor.particles>0);
state.nodes.decor.grid=32;toggleEffectNode('decor');toggleEffectNode('decor');assert.equal(state.nodes.decor.grid,32,'Keep edited values');
assert.equal(remembered,renders);
`,scope);
const desktop=section('      function renderNodeList(','      function closeParamFlyout(');
const mobile=section('      function renderMobileEffects(','      function syncReverseToggle(');
assert(desktop.includes('aria-disabled')&&desktop.includes('!meta.available'));
assert(mobile.includes('item.disabled = !meta.available'));
assert(desktop.includes('toggleEffectNode(meta.id)')&&mobile.includes('toggleEffectNode(meta.id)'));
const output=fs.readFileSync(path.join(__dirname,'image-output-renderer.js'),'utf8');
assert(output.includes('const inkStrength = ink.enabled ?'));
assert(output.includes('const em = edge.enabled ?'));
console.log('PASS: per-preset availability, Pen L/H parameters, desktop/mobile guards, meaningful optional defaults and export toggle guards');
