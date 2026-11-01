const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),code=fs.readFileSync(path.join(root,'assets/canvas-theme.js'),'utf8');
for(const saved of [null,'light','dark','invalid']) {
  const attrs={},dataset={},store=new Map(saved?[['graphicTextureCanvasTheme',saved]]:[]);
  let click,ready;
  const button={setAttribute:(key,value)=>attrs[key]=value,addEventListener:(type,fn)=>{if(type==='click')click=fn;}};
  const scope={document:{documentElement:{dataset},readyState:'loading',getElementById:id=>id==='canvasThemeToggle'?button:null,addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')ready=fn;}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}};
  vm.runInNewContext(code,scope);
  assert.equal(dataset.canvasTheme,saved==='light'?'light':'dark','Preference is set before body paint');
  ready();assert.equal(attrs['aria-pressed'],String(saved==='light'));
  const old=dataset.canvasTheme;click();assert.notEqual(dataset.canvasTheme,old);
  assert.equal(store.get('graphicTextureCanvasTheme'),dataset.canvasTheme);
  click();assert.equal(dataset.canvasTheme,old);
}
vm.runInNewContext(code,{document:{documentElement:{dataset:{}},readyState:'complete',getElementById:()=>null},localStorage:{getItem(){throw Error('blocked');}}});
assert(!/renderAll|renderOutput|state\.|getContext|putImageData/.test(code.replace(/\/\*[\s\S]*?\*\//g,'')),'Theme cannot touch effect state or canvas pixels');
const html=fs.readFileSync(path.join(root,'tools/graphic-texture-demo.html'),'utf8');
assert(html.includes('id="canvasThemeToggle"'));assert(html.includes('src="../assets/canvas-theme.js"'));
for(const name of ['base','core','ray-v','ray-h','ray-d1','ray-d2'])assert(fs.statSync(path.join(root,'assets/canvas-theme-'+name+'-figma.svg')).size>100);
for(const name of ['base','core','ray-v'])assert(fs.statSync(path.join(root,'assets/canvas-theme-sun-'+name+'-figma.svg')).size>100);
for(const theme of ['dark','light']) assert(html.includes('class="canvas-theme-art canvas-theme-art-'+theme+'"'),'Each artboard has its own icon artwork');
console.log('PASS: UI-only canvas theme, immediate preference restoration, accessible toggle, storage fallback, local Figma assets');
