/* Multi-mask Pen Trace: connected paths shared by preview and native-size output. */
function usesContinuousPenTrace(preset, quality) {
  // Only H uses the new multi-mask path renderer. L deliberately runs the
  // published pixel/mask/noise pipeline still retained in the main renderer.
  return preset === "penTrace" && quality >= 1920;
}

function normalizeEffectResolution(preset, quality) {
  // Preserve old recipe indices; migrate only Pen Trace's retired M to H.
  return preset === "penTrace" && quality === 1080 ? 1920 : quality;
}

function penTraceQualityProfile(quality) {
  // L uses fine, dry hand-drawn edges; M keeps smooth pressure variation.
  // H keeps the approved constant-width geometry and drawing commands.
  if(quality<=720)return {outlineWidth:1.25,innerWidth:1,pressure:0,detailPreserving:true,handDrawn:true,maxPaths:320,structureCount:3};
  if(quality<1920)return {outlineWidth:2.7,innerWidth:1.85,pressure:.12,maxPaths:280,structureCount:3};
  return {outlineWidth:2,innerWidth:1.6,pressure:0,maxPaths:360,structureCount:3};
}

function smoothPenTraceMask(mask, width, height, filterRadius = Math.max(width, height) / 1920 * 2) {
  const radius = Math.max(1, Math.round(filterRadius));
  const span = radius * 2 + 1;
  const horizontal = new Float32Array(mask.length);
  const smooth = new Float32Array(mask.length);
  // A bounded separable filter removes isolated threshold pixels without changing the source mask.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= radius && x < width; x++) sum += mask[row + x];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / span;
      if (x - radius >= 0) sum -= mask[row + x - radius];
      if (x + radius + 1 < width) sum += mask[row + x + radius + 1];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= radius && y < height; y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      smooth[y * width + x] = sum / span;
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
    }
  }
  return smooth;
}

function createPenTraceContours(mask, width, height, options = {}) {
  const field = options.smoothed ? mask : smoothPenTraceMask(mask, width, height, options.radius);
  const level = (options.level ?? .5) + .00001; // Avoid coincident grid-vertex crossings.
  const stride = width + 1;
  const graph = new Map();
  const sample = (x, y) => x > 0 && x <= width && y > 0 && y <= height
    ? field[(y - 1) * width + x - 1] : 0;
  const table = [[], [3,0], [0,1], [3,1], [1,2], [], [0,2], [3,2],
    [2,3], [0,2], [], [1,2], [1,3], [0,1], [3,0], []];
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const a = sample(x,y), b = sample(x+1,y), c = sample(x+1,y+1), d = sample(x,y+1);
      const code = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      let pairs = table[code];
      // Resolve saddle cells consistently, so nearby paths never reconnect at random.
      if (code === 5) pairs = (a+b+c+d)/4 > level ? [0,1,2,3] : [3,0,1,2];
      if (code === 10) pairs = (a+b+c+d)/4 > level ? [3,0,1,2] : [0,1,2,3];
      const point = edge => {
        let id, p, q, px, py, vertical = false;
        if (edge === 0) { id = (y*stride+x)*2; p=a; q=b; px=x; py=y; }
        else if (edge === 1) { id = (y*stride+x+1)*2+1; p=b; q=c; px=x+1; py=y; vertical=true; }
        else if (edge === 2) { id = ((y+1)*stride+x)*2; p=d; q=c; px=x; py=y+1; }
        else { id = (y*stride+x)*2+1; p=a; q=d; px=x; py=y; vertical=true; }
        if (!graph.has(id)) {
          const t = Math.max(0, Math.min(1, (level-p)/(q-p)));
          graph.set(id, {x:px-.5+(vertical?0:t), y:py-.5+(vertical?t:0), neighbors:[]});
        }
        return id;
      };
      for (let i = 0; i < pairs.length; i += 2) {
        const p = point(pairs[i]), q = point(pairs[i+1]);
        graph.get(p).neighbors.push(q); graph.get(q).neighbors.push(p);
      }
    }
  }
  const visited = new Set(), contours = [];
  const scale = Math.max(width,height)/1920;
  const minLength = options.minLength ?? Math.max(10, 16*scale);
  const minArea = options.minArea ?? Math.max(2, 4*scale*scale);
  for (const [start] of graph) {
    if (visited.has(start)) continue;
    const points = [];
    let previous = -1, current = start;
    do {
      if (visited.has(current)) break;
      visited.add(current);
      const node = graph.get(current);
      points.push({x:node.x,y:node.y});
      const next = node.neighbors.find(id => id !== previous);
      previous = current; current = next;
    } while (current !== undefined && current !== start);
    if (current !== start || points.length < 4) continue;
    let length = 0, area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i+1)%points.length];
      length += Math.hypot(b.x-a.x,b.y-a.y); area += a.x*b.y-b.x*a.y;
    }
    if (length >= minLength && Math.abs(area)/2 >= minArea) contours.push(points);
  }
  return contours;
}

function penTracePathLength(points, closed = true) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  if (closed && points.length > 1) length += Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y);
  return length;
}

function refinePenTracePath(points, closed, tolerance) {
  // Smooth before simplifying: preserve broad structure instead of faithfully tracing pixel stair-steps.
  let filtered = points.map(p=>({x:p.x,y:p.y}));
  for (let pass = 0; pass < 2; pass++) filtered = filtered.map((p,i,list)=>{
    if (!closed && (i===0 || i===list.length-1)) return p;
    const a=list[(i-1+list.length)%list.length],b=list[(i+1)%list.length];
    return {x:(a.x+2*p.x+b.x)/4,y:(a.y+2*p.y+b.y)/4};
  });
  if (closed) filtered.push({...filtered[0]});
  const keep = new Uint8Array(filtered.length), stack = [[0,filtered.length-1]];
  keep[0]=keep[filtered.length-1]=1;
  while (stack.length) {
    const [start,end]=stack.pop(),a=filtered[start],b=filtered[end];
    const dx=b.x-a.x,dy=b.y-a.y,denom=dx*dx+dy*dy;
    let far=-1,max=tolerance*tolerance;
    for(let i=start+1;i<end;i++) {
      const p=filtered[i],t=denom?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/denom)):0;
      const d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
      if(d>max){max=d;far=i;}
    }
    if(far>=0){keep[far]=1;stack.push([start,far],[far,end]);}
  }
  const simplified=filtered.filter((_,i)=>keep[i]);
  if(closed)simplified.pop();
  const result=simplified.length>=4?simplified:points.map(p=>({x:p.x,y:p.y}));
  result.closed=closed;
  return result;
}

function isPenTraceCanvasFrame(points, width, height) {
  // Zero padding around a bright/reversed mask can create a closed rectangle.
  // Reject only a near-full-canvas, four-sided frame, not a subject touching an edge.
  const margin=Math.max(4,Math.min(width,height)*.025);
  const sideLengths=[0,0,0,0];
  let length=0,edgeLength=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],segment=Math.hypot(b.x-a.x,b.y-a.y);
    length+=segment;
    let edge=false;
    if(a.y<margin&&b.y<margin){sideLengths[0]+=Math.abs(b.x-a.x);edge=true;}
    if(a.x>width-margin&&b.x>width-margin){sideLengths[1]+=Math.abs(b.y-a.y);edge=true;}
    if(a.y>height-margin&&b.y>height-margin){sideLengths[2]+=Math.abs(b.x-a.x);edge=true;}
    if(a.x<margin&&b.x<margin){sideLengths[3]+=Math.abs(b.y-a.y);edge=true;}
    if(edge)edgeLength+=segment;
  }
  return length>0&&edgeLength/length>.88
    &&sideLengths[0]>width*.65&&sideLengths[2]>width*.65
    &&sideLengths[1]>height*.65&&sideLengths[3]>height*.65;
}

function stripPenTraceCanvasEdges(paths, width, height) {
  const margin=Math.max(4,Math.min(width,height)*.025),minimumRun=Math.max(10,Math.min(width,height)*.06);
  const clean=[];
  for(const points of paths){
    const closed=points.closed!==false,count=points.length-(closed?0:1),sides=[],lengths=[];
    for(let i=0;i<count;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      let side=-1;
      if(Math.abs(dy)<length*.35){if(a.y<margin&&b.y<margin)side=0;else if(a.y>height-margin&&b.y>height-margin)side=2;}
      if(Math.abs(dx)<length*.35){if(a.x<margin&&b.x<margin)side=3;else if(a.x>width-margin&&b.x>width-margin)side=1;}
      sides.push(side);lengths.push(length);
    }
    const remove=new Uint8Array(count),visited=new Uint8Array(count);
    for(let i=0;i<count;i++){
      if(visited[i]||sides[i]<0)continue;
      const run=[i];visited[i]=1;
      for(const direction of [-1,1]){
        let j=i+direction;
        while(closed||(j>=0&&j<count)){
          const k=(j+count)%count;
          if(visited[k]||sides[k]!==sides[i])break;
          visited[k]=1;run.push(k);j+=direction;
        }
      }
      if(run.reduce((sum,k)=>sum+lengths[k],0)>=minimumRun)for(const k of run)remove[k]=1;
    }
    const firstRemoved=remove.findIndex(value=>value===1);
    if(firstRemoved<0){clean.push(points);continue;}
    let part=[];
    const flush=()=>{
      if(part.length>1&&penTracePathLength(part,false)>=6){part.closed=false;part.layer=points.layer;clean.push(part);}
      part=[];
    };
    for(let offset=0;offset<count;offset++){
      const i=closed?(firstRemoved+1+offset)%count:offset;
      if(remove[i]){flush();continue;}
      if(!part.length)part.push(points[i]);
      part.push(points[(i+1)%points.length]);
    }
    flush();
  }
  // Remove small disconnected remnants wholly contained in a border band.
  // An actual subject path continuing into the picture is retained.
  const filtered=clean.filter(path=>![
    p=>p.x<margin,p=>p.x>width-margin,p=>p.y<margin,p=>p.y>height-margin,
  ].some(inBand=>path.every(inBand)));
  const stats={...paths.stats,outline:0,structure:0,detail:0};
  for(const path of filtered)stats[path.layer||'outline']++;
  filtered.stats=stats;
  return filtered;
}

function createPenTraceStructure(source, mask, width, height, nodes, reversed = false, quality = 1920) {
  const profile=penTraceQualityProfile(quality);
  const scale=Math.max(width,height)/1920;
  const seed=Math.round(nodes.distress?.seed || 18);
  const random = index => {
    const n=Math.sin(seed*127.1+index*311.7)*43758.5453;
    return n-Math.floor(n);
  };
  const outer=createPenTraceContours(mask,width,height,{
    radius:Math.max(1,scale*3.2),minLength:Math.max(16,64*scale),minArea:Math.max(4,36*scale*scale),
  }).filter(p=>!isPenTraceCanvasFrame(p,width,height)).map(p=>{
    const refined=refinePenTracePath(p,true,Math.max(.3,scale*1.3));
    refined.layer="outline"; return refined;
  });
  // Interior layers retain original image information. The hard subject mask only gates their location.
  const factor=Math.min(1,1280/Math.max(width,height));
  const w=Math.max(2,Math.round(width*factor)),h=Math.max(2,Math.round(height*factor));
  const gray=new Float32Array(w*h),domain=new Uint8Array(w*h),histogram=new Uint32Array(256);
  let samples=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const xx=Math.min(width-1,Math.floor((x+.5)*width/w)),yy=Math.min(height-1,Math.floor((y+.5)*height/h));
    const p=yy*width+xx,i=p*4,q=y*w+x;
    const r=source.data[i]/255,g=source.data[i+1]/255,b=source.data[i+2]/255;
    gray[q]=Math.max(0,Math.min(1,r*.299+g*.587+b*.114+(r-b)*.035));
    domain[q]=mask[p]>.08 && source.data[i+3]>8 ? 1:0;
  }
  if(!reversed) {
    // Fill mask holes for the structure search, without filling or changing the visible outline.
    const outside=new Uint8Array(w*h),queue=new Int32Array(w*h);
    let head=0,tail=0;
    const add=p=>{if(!domain[p]&&!outside[p]){outside[p]=1;queue[tail++]=p;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
    for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);if(x)add(p-1);if(x<w-1)add(p+1);if(y)add(p-w);if(y<h-1)add(p+w);}
    for(let p=0;p<domain.length;p++)if(!outside[p])domain[p]=1;
  }
  for(let p=0;p<domain.length;p++)if(domain[p]){histogram[Math.round(gray[p]*255)]++;samples++;}
  if(!samples)return stripPenTraceCanvasEdges(Object.assign(outer,{stats:{outline:outer.length,structure:0,detail:0,maskLayers:1}}),width,height);
  const percentile=t=>{let count=0;for(let i=0;i<256;i++){count+=histogram[i];if(count>=samples*t)return i/255;}return 1;};
  const lo=percentile(.04),hi=percentile(.96);
  const toneRange=Math.max(.08,hi-lo),smallScale=Math.max(w,h)/1920;
  const occupancyCell=Math.max(1,scale*2.5),gridW=Math.ceil(width/occupancyCell)+1,gridH=Math.ceil(height/occupancyCell)+1;
  const occupied=new Uint8Array(gridW*gridH);
  const mark=points=>{
    for(let i=0;i<points.length-(points.closed===false?1:0);i++) {
      const a=points[i],b=points[(i+1)%points.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/occupancyCell));
      for(let j=0;j<=steps;j++){const t=j/steps,gx=Math.max(0,Math.min(gridW-1,Math.floor((a.x+(b.x-a.x)*t)/occupancyCell))),gy=Math.max(0,Math.min(gridH-1,Math.floor((a.y+(b.y-a.y)*t)/occupancyCell)));occupied[gy*gridW+gx]=1;}
    }
  };
  outer.forEach(mark);
  const boundaryOccupied=new Uint8Array(occupied);
  const paths=[...outer],stats={outline:outer.length,structure:0,detail:0,maskLayers:1};
  const nearPath=(p,grid,radius=1)=>{
    const gx=Math.floor(p.x/occupancyCell),gy=Math.floor(p.y/occupancyCell);
    for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++)if(grid[(gy+oy)*gridW+gx+ox])return true;
    return false;
  };
  const allowed=p=>{
    const x=Math.round(p.x*w/width),y=Math.round(p.y*h/height);
    if(x<1||y<1||x>=w-1||y>=h-1||!domain[y*w+x])return false;
    // L must not retrace a threshold halo as a second parallel subject outline.
    return !nearPath(p,boundaryOccupied,profile.handDrawn?Math.ceil(3.5/occupancyCell):1);
  };
  const append=(raw,layer)=>{
    const candidates=raw.map(p=>p.map(v=>({x:v.x*width/w,y:v.y*height/h})))
      .filter(p=>!isPenTraceCanvasFrame(p,width,height));
    candidates.sort((a,b)=>penTracePathLength(b)-penTracePathLength(a));
    for(const points of candidates) {
      if(paths.length>=profile.maxPaths)break;
      const valid=points.map(allowed),invalid=valid.findIndex(v=>!v);
      const fragments=[];
      if(invalid<0){points.closed=true;fragments.push(points);}
      else {
        let fragment=[];
        for(let i=1;i<=points.length;i++){
          const k=(invalid+i)%points.length;
          if(valid[k])fragment.push(points[k]);
          else if(fragment.length){fragment.closed=false;fragments.push(fragment);fragment=[];}
        }
      }
      for(const fragment of fragments) {
        if(fragment.length<5||penTracePathLength(fragment,fragment.closed)<Math.max(12,(layer==="detail"?25:32)*scale))continue;
        // Reject a largely duplicated path as a whole; don't perforate a useful line at every crossing.
        let overlap=0;
        for(const point of fragment)if(nearPath(point,occupied))overlap++;
        if(overlap/fragment.length>.7)continue;
        const refined=refinePenTracePath(fragment,fragment.closed,Math.max(.35,scale*(layer==="detail"?1:1.3)));
        refined.layer=layer;paths.push(refined);stats[layer]++;mark(refined);
      }
    }
  };
  const structureCount=profile.structureCount===2?2:(seed%5===0?2:3);
  const positions=structureCount===2?[.32,.68]:[.23,.49,.76];
  const thresholdOffset=((nodes.extract?.threshold||142)-142)/255*.18;
  for(let index=0;index<structureCount;index++) {
    const field=smoothPenTraceMask(gray,w,h,profile.detailPreserving?1:Math.max(2,smallScale*(3.4+random(index)*2)));
    const level=Math.max(.03,Math.min(.97,lo+toneRange*(positions[index]+(random(index+9)-.5)*.1+thresholdOffset)));
    append(createPenTraceContours(field,w,h,{smoothed:true,level,minLength:Math.max(14,40*smallScale),minArea:Math.max(3,15*smallScale*smallScale)}),"structure");
    stats.maskLayers++;
  }
  // A separate local-contrast mask recovers folds/ribs that share similar global brightness.
  const denoised=smoothPenTraceMask(gray,w,h,profile.detailPreserving?1:Math.max(2,smallScale*3.3));
  const local=smoothPenTraceMask(denoised,w,h,Math.max(3,smallScale*(14+random(31)*8)));
  const detail=new Float32Array(w*h);
  for(let p=0;p<detail.length;p++)detail[p]=.5+(denoised[p]-local[p])*2;
  append(createPenTraceContours(detail,w,h,{smoothed:true,level:.53+random(32)*.025,minLength:profile.detailPreserving?22:Math.max(15,45*smallScale),minArea:profile.detailPreserving?8:Math.max(4,20*smallScale*smallScale)}),"detail");
  stats.maskLayers++;
  paths.stats=stats;
  const clean=stripPenTraceCanvasEdges(paths,width,height);
  if(quality>=1920){
    clean.printTexture=createPenTracePrintTexture(source,mask,width,height,nodes,clean);
    clean.stats.textureMarks=clean.printTexture.fill.length;
    clean.stats.edgeFibers=clean.printTexture.edge.length;
  }
  return clean;
}

function createPenTracePrintTexture(source, mask, width, height, nodes, contours) {
  const fill=[],edge=[];
  const scale=Math.max(width,height)/1920;
  const fabric=nodes.texture?.enabled?Math.max(0,Math.min(100,nodes.texture.fabric||0))/100:0;
  const rough=nodes.edge?.enabled&&nodes.distress?.enabled
    ?Math.max(0,Math.min(100,nodes.edge.rough||0))/100*Math.sqrt(Math.max(0,Math.min(100,nodes.distress.amount||0))/100):0;
  if(!fabric&&!rough)return {fill,edge,scale};
  const seed=Math.round(nodes.distress?.seed||18);
  const random=(x,y,salt=0)=>{
    let n=Math.imul(x+seed*31,374761393)^Math.imul(y+salt*17,668265263);
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  };
  const fields=[];
  const field=(x,y,size,salt)=>{
    let lattice=fields[salt];
    if(!lattice){
      const cols=Math.ceil(width/scale/size)+5,rows=Math.ceil(height/scale/size)+5,values=new Float64Array(cols*rows);
      for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++)values[gy*cols+gx]=random(gx-2,gy-2,salt);
      lattice=fields[salt]={cols,values};
    }
    const xx=x/size,yy=y/size,ix=Math.floor(xx),iy=Math.floor(yy);
    const tx=xx-ix,ty=yy-iy,fx=tx*tx*(3-2*tx),fy=ty*ty*(3-2*ty);
    const p=(iy+2)*lattice.cols+ix+2,a=lattice.values[p],b=lattice.values[p+1],c=lattice.values[p+lattice.cols],d=lattice.values[p+lattice.cols+1];
    return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
  };
  if(fabric){
    const factor=Math.min(1,768/Math.max(width,height)),w=Math.round(width*factor),h=Math.round(height*factor);
    const gray=new Float32Array(w*h),histogram=new Uint32Array(256);
    let samples=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const xx=Math.min(width-1,Math.floor((x+.5)*width/w)),yy=Math.min(height-1,Math.floor((y+.5)*height/h)),p=yy*width+xx,i=p*4;
      // Lift shadow variation for print shading without changing the displayed ink palette.
      const g=Math.sqrt((source.data[i]*.299+source.data[i+1]*.587+source.data[i+2]*.114)/255);
      gray[y*w+x]=g;
      if(mask[p]>.08&&source.data[i+3]>8){histogram[Math.round(g*255)]++;samples++;}
    }
    const percentile=t=>{let count=0;for(let i=0;i<256;i++){count+=histogram[i];if(count>=samples*t)return i/255;}return 1;};
    const lo=percentile(.04),hi=percentile(.96),range=Math.max(.08,hi-lo);
    const smooth=smoothPenTraceMask(gray,w,h,2),local=smoothPenTraceMask(smooth,w,h,10);
    const margin=Math.max(4,Math.min(width,height)*.025);
    const area=Math.max(0,width-margin*2)*Math.max(0,height-margin*2);
    const candidates=Math.min(200000,Math.round(area/Math.max(1.5,3.1*scale)**2));
    const strength=.3+.7*Math.sqrt(fabric);
    // Independent, continuous positions remove the screen/lattice signature entirely.
    // Correlated fields form ink islands and dry pores at several physical scales.
    for(let candidate=0;candidate<candidates;candidate++){
      const px=margin+random(candidate,1,21)*(width-margin*2),py=margin+random(candidate,2,22)*(height-margin*2);
      const ix=Math.round(px),iy=Math.round(py),p=iy*width+ix,i=p*4;
      if(mask[p]<.15||source.data[i+3]<16)continue;
      const gx=Math.max(1,Math.min(w-2,Math.round(px*w/width))),gy=Math.max(1,Math.min(h-2,Math.round(py*h/height))),q=gy*w+gx;
      const tone=hi-lo>.06?Math.max(0,Math.min(1,(hi-smooth[q])/range)):1-smooth[q];
      const contrast=Math.min(1,Math.abs(smooth[q]-local[q])/range*3);
      const dx=smooth[q+1]-smooth[q-1],dy=smooth[q+w]-smooth[q-w],gradient=Math.min(1,Math.hypot(dx,dy)/range*8);
      const sx=px/scale,sy=py/scale;
      const warpX=(field(sx,sy,85,31)-.5)*25,warpY=(field(sx,sy,85,32)-.5)*25;
      const broad=field(sx+warpX,sy+warpY,64,33),patch=field(sx,sy,19,34),fine=field(sx,sy,6,35);
      const cloud=Math.max(0,Math.min(1,(broad*.55+patch*.3+fine*.15-.24)*1.8));
      const pore=field(sx+warpY,sy+warpX,11,36);
      const dry=pore>.72?.08:pore>.6?.4:1;
      const density=Math.min(.92,(tone*.85+contrast*.5+gradient*.4)*strength*(.08+cloud*1.8)*dry)*Math.min(1,mask[p]);
      if(random(candidate,3,23)>density)continue;
      const angle=gradient>.15?Math.atan2(dy,dx)+Math.PI*.5:-.6+(field(sx,sy,42,37)-.5)*1.2;
      const size=random(candidate,4,24),large=random(candidate,5,25)>.975;
      const radius=(.22+size*size*1.65+(large?1.4:0))*scale;
      if(radius>margin||px-radius<margin||py-radius<margin||px+radius>width-margin||py+radius>height-margin)continue;
      const fiber=random(candidate,6,26)<.07;
      const length=(1.5+random(candidate,7,27)*5+contrast*4)*scale;
      fill.push({x:px,y:py,kind:fiber?'fiber':'grain',radius,angle,
        elongation:.65+random(candidate,8,28)*.9,shape:random(candidate,9,29),
        hole:!fiber&&radius>1.25*scale&&random(candidate,10,30)>.78,
        dx:Math.cos(angle)*length*.5,dy:Math.sin(angle)*length*.5,width:(.4+size*.55)*scale,
        level:Math.min(2,Math.floor((tone+contrast*.5)*3))});
    }
  }
  if(rough){
    const grainScale=Math.max(.65,Math.min(1.8,Math.sqrt((nodes.distress.size||4)/4)));
    const step=Math.max(1.1,2.5*scale*grainScale),band=(1.2+rough*11)*scale*grainScale;
    for(const path of contours){
      const count=path.length-(path.closed===false?1:0);
      for(let i=0;i<count;i++){
        const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        if(!length)continue;
        const tx=dx/length,ty=dy/length;
        for(let d=0;d<length;){
          const x=a.x+tx*d,y=a.y+ty*d,rx=Math.floor(x/step),ry=Math.floor(y/step);
          d+=step*(.5+random(rx,ry,8)*1.25);
          const clump=.15+field(x/scale,y/scale,28,41)*1.4;
          if(random(rx,ry,9)>(.25+rough*.65)*clump)continue;
          const side=random(rx,ry,10)>.5?1:-1,offset=side*band*Math.pow(random(rx,ry,11),1.8);
          const len=(.7+random(rx,ry,12)*1.8)*scale*grainScale;
          const px=x-ty*offset,py=y+tx*offset,margin=Math.max(4,Math.min(width,height)*.025);
          if(px<margin||py<margin||px>width-margin||py>height-margin)continue;
          const size=random(rx,ry,13);
          edge.push({x:px,y:py,kind:random(rx,ry,15)>.85?'fiber':'grain',
            radius:(.2+size*size*1.3)*scale*grainScale,angle:Math.atan2(ty,tx),elongation:.7+random(rx,ry,16)*.65,shape:random(rx,ry,17),hole:false,
            dx:tx*len*.5,dy:ty*len*.5,width:(.4+size*.7)*scale*grainScale,level:random(rx,ry,14)>.65?1:0});
          if(edge.length>=30000)break;
        }
        if(edge.length>=30000)break;
      }
      if(edge.length>=30000)break;
    }
  }
  return {fill,edge,scale};
}

function drawPenTracePrintTexture(ctx, texture, opacity) {
  ctx.lineCap='butt';ctx.lineJoin='bevel';
  ctx.fillStyle=ctx.strokeStyle;
  for(const [marks,alphas,widths] of [[texture.fill,[.45,.65,.85],[1.1,.65]],[texture.edge,[.45,.8],[1.4,.9]]]){
    for(let level=0;level<alphas.length;level++){
      const selected=marks.filter(mark=>mark.level===level);
      if(!selected.length)continue;
      ctx.globalAlpha=opacity*alphas[level];
      ctx.beginPath();
      let grains=0;
      for(const mark of selected)if(mark.kind==='grain'){
        // Irregular ink flecks, with transparent internal pinholes on a few larger flecks.
        for(const hole of mark.hole?[false,true]:[false]){
          for(let vertex=0;vertex<6;vertex++){
            const index=hole?5-vertex:vertex,theta=mark.angle+index*Math.PI/3;
            const irregular=.77+.23*Math.sin(mark.shape*73.7+index*11.1);
            const radius=mark.radius*(hole?.38:irregular);
            const px=mark.x+Math.cos(theta)*radius*mark.elongation,py=mark.y+Math.sin(theta)*radius;
            if(vertex===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
          }
          ctx.closePath();
        }
        grains++;
      }
      if(grains)ctx.fill();
      // Width buckets keep tens of thousands of small print marks inexpensive to draw.
      for(const bucket of [0,1]){
        ctx.lineWidth=widths[bucket]*texture.scale;ctx.beginPath();
        let count=0;
        for(const mark of selected)if(mark.kind!=='grain'&&(mark.width<texture.scale?1:0)===bucket){
          ctx.moveTo(mark.x-mark.dx,mark.y-mark.dy);ctx.lineTo(mark.x+mark.dx,mark.y+mark.dy);count++;
        }
        if(count)ctx.stroke();
      }
    }
  }
}

function createHandDrawnPenRibbon(points, baseWidth, seed, roughness=.65) {
  // Uneven ink patches separated by quiet, fine stretches. Noise is sampled by
  // arclength, not by vertex index: no periodic tooth pattern around the contour.
  if(points.length<2)return [];
  const closed=points.closed!==false,curve=[];
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  let start=closed?mid(points.at(-1),points[0]):points[0];
  curve.push(start);
  for(let i=closed?0:1;i<points.length;i++){
    const control=points[i],end=i===points.length-1&&!closed?control:mid(control,points[(i+1)%points.length]);
    const count=Math.max(1,Math.ceil((Math.hypot(control.x-start.x,control.y-start.y)+Math.hypot(end.x-control.x,end.y-control.y))/.45));
    for(let j=1;j<=count;j++){
      const t=j/count,u=1-t;
      curve.push({x:u*u*start.x+2*u*t*control.x+t*t*end.x,y:u*u*start.y+2*u*t*control.y+t*t*end.y});
    }
    start=end;
  }
  if(closed)curve.pop();
  const random=i=>{const v=Math.sin(seed*17.13+points[0].x*.71+points[0].y*.37+i*91.9)*43758.5453;return v-Math.floor(v);};
  const noise=(d,span,salt)=>{
    const t=d/span,k=Math.floor(t),f=t-k,u=f*f*(3-2*f);
    return random(k+salt)*(1-u)+random(k+salt+1)*u;
  };
  const ribbon=[],flecks=[];
  let distance=0;
  for(let i=0;i<curve.length;i++){
    const p=curve[i],a=curve[closed?(i-1+curve.length)%curve.length:Math.max(0,i-1)],b=curve[closed?(i+1)%curve.length:Math.min(curve.length-1,i+1)];
    if(i)distance+=Math.hypot(p.x-curve[i-1].x,p.y-curve[i-1].y);
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    const patch=Math.pow(Math.max(0,(noise(distance,13,2001)-.36)/.64),1.6);
    const cluster=patch*(.35+.65*noise(distance,3.7,4001));
    const wander=roughness*((noise(distance,7.3,6001)-.5)*.45+(noise(distance,.7,8001)-.5)*cluster*.8);
    const pressure=.62+noise(distance,5.1,10001)*.65+roughness*cluster*1.2;
    const bite=cluster>.18&&noise(distance,.47,12001)>.69?.32:1;
    const left=Math.max(.035,baseWidth*.5*pressure*bite+roughness*cluster*(random(i*4+2)-.5)*.6);
    const right=Math.max(.035,baseWidth*.5*pressure+roughness*cluster*(random(i*4+3)-.5)*.6);
    const dry=noise(distance,.83,14001)>.86&&noise(distance,9.7,16001)>.6;
    ribbon.push({left:{x:p.x+nx*(wander+left),y:p.y+ny*(wander+left)},right:{x:p.x+nx*(wander-right),y:p.y+ny*(wander-right)},dry,cluster});
    // Short fibers and ink crumbs accumulate only at selected rough patches.
    // They never form a uniform dotted outline or a background noise layer.
    if(cluster>.12&&random(i*4+401)<cluster*.48*roughness){
      const sign=random(i*4+402)>.5?1:-1,r=.08+random(i*4+403)*.19;
      const offset=sign*(baseWidth*.5*pressure+.15+random(i*4+404)*.6*roughness);
      flecks.push({x:p.x+nx*(wander+offset),y:p.y+ny*(wander+offset),nx,ny,r,length:r*(1.1+random(i*4+405)*2.4)});
    }
  }
  ribbon.closed=closed;
  ribbon.flecks=flecks;
  return ribbon;
}

function addHandDrawnPenPath(ctx, points, width, seed, roughness) {
  const ribbon=createHandDrawnPenRibbon(points,width,seed,roughness);
  // Same-winding overlapping quads form a union in one nonzero fill. Even
  // crossing contours receive ink once, with no dark overlap or hollow cancellation.
  for(let i=0;i<ribbon.length-(ribbon.closed?0:1);i++){
    const a=ribbon[i],b=ribbon[(i+1)%ribbon.length];
    if(a.dry&&b.dry)continue;
    const polygon=[a.left,a.right,b.right,b.left];
    let area=0;
    for(let j=0;j<4;j++){const p=polygon[j],q=polygon[(j+1)%4];area+=p.x*q.y-q.x*p.y;}
    if(area<0)polygon.reverse();
    ctx.moveTo(polygon[0].x,polygon[0].y);
    for(let j=1;j<4;j++)ctx.lineTo(polygon[j].x,polygon[j].y);
    ctx.closePath();
  }
  for(const p of ribbon.flecks){
    ctx.moveTo(p.x+p.nx*p.r,p.y+p.ny*p.r);
    ctx.lineTo(p.x-p.ny*p.length,p.y+p.nx*p.length);
    ctx.lineTo(p.x-p.nx*p.r*.65,p.y-p.ny*p.r*.65);
    ctx.lineTo(p.x+p.ny*p.length*.6,p.y-p.nx*p.length*.6);
    ctx.closePath();
  }
}

function addPressurePenTracePath(ctx, points, baseWidth, amplitude, seed) {
  // One continuous ribbon per path avoids dotted edges and alpha seams between segments.
  const closed=points.closed!==false,distances=[0];
  for(let i=1;i<points.length;i++)distances[i]=distances[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  const total=distances.at(-1)+(closed?Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y):0);
  if(total<=0)return;
  const phase=(Math.sin(seed*13.1+points[0].x*.03+points[0].y*.07)*.5+.5)*Math.PI*2;
  const left=[],right=[];
  for(let i=0;i<points.length;i++) {
    const p=points[i],a=points[closed?(i-1+points.length)%points.length:Math.max(0,i-1)],b=points[closed?(i+1)%points.length:Math.min(points.length-1,i+1)];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,t=distances[i]/total;
    const pressure=1+amplitude*(.7*Math.sin(t*Math.PI*2+phase)+.3*Math.sin(t*Math.PI*4+phase));
    const lift=closed?1:.55+.45*Math.pow(Math.max(0,Math.sin(t*Math.PI)),.3);
    const radius=baseWidth*.5*pressure*lift,nx=-dy/length,ny=dx/length;
    left.push({x:p.x+nx*radius,y:p.y+ny*radius});right.push({x:p.x-nx*radius,y:p.y-ny*radius});
  }
  const side=(list,close)=>{
    const first=list[0],last=list.at(-1);
    if(close)ctx.moveTo((last.x+first.x)/2,(last.y+first.y)/2);
    else ctx.moveTo(first.x,first.y);
    for(let i=close?0:1;i<list.length-(close?0:1);i++){
      const a=list[i],b=list[(i+1)%list.length];ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
    }
    if(close)ctx.closePath();else ctx.lineTo(last.x,last.y);
  };
  if(closed){side(left,true);side([...right].reverse(),true);}
  else {
    side(left,false);
    const end=points.at(-1),previous=points.at(-2),dx=end.x-previous.x,dy=end.y-previous.y,length=Math.hypot(dx,dy)||1;
    const cap=Math.hypot(left.at(-1).x-end.x,left.at(-1).y-end.y);
    ctx.quadraticCurveTo(end.x+dx/length*cap,end.y+dy/length*cap,right.at(-1).x,right.at(-1).y);
    const backwards=[...right].reverse();
    for(let i=1;i<backwards.length-1;i++){
      const a=backwards[i],b=backwards[i+1];ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
    }
    ctx.lineTo(right[0].x,right[0].y);
    const start=points[0],next=points[1],sx=next.x-start.x,sy=next.y-start.y,sl=Math.hypot(sx,sy)||1;
    const startCap=Math.hypot(left[0].x-start.x,left[0].y-start.y);
    ctx.quadraticCurveTo(start.x-sx/sl*startCap,start.y-sy/sl*startCap,left[0].x,left[0].y);
    ctx.closePath();
  }
}

function drawContinuousPenTrace(ctx, contours, width, height, nodes, transparent, quality = 1920) {
  const profile=penTraceQualityProfile(quality);
  const {ink,edge,color} = nodes;
  ctx.save();
  ctx.clearRect(0,0,width,height);
  if (!transparent) {
    const bg = hexToRgb(color.bg), alpha = getColorAlpha(color,"bg")/100;
    ctx.fillStyle = `rgb(${lerp(255,bg.r,alpha)},${lerp(255,bg.g,alpha)},${lerp(255,bg.b,alpha)})`;
    ctx.fillRect(0,0,width,height);
  }
  if (ink.enabled && edge.enabled && edge.width > 0) {
    const a = hexToRgb(ink.color), b = hexToRgb(edge.color);
    ctx.strokeStyle = `rgb(${lerp(a.r,b.r,.322)},${lerp(a.g,b.g,.322)},${lerp(a.b,b.b,.322)})`;
    ctx.globalAlpha = Math.max(0, Math.min(1, .92*.94*ink.strength/100*getColorAlpha(ink,"color")/100));
    const opacity=ctx.globalAlpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if(profile.handDrawn){
      ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();
      const roughness=.55+.45*Math.max(0,Math.min(1,(edge.rough??60)/100));
      for(const points of contours){
        const layer=points.layer||"outline";
        const width=Math.max(.65,edge.width*(layer==="outline"?profile.outlineWidth:profile.innerWidth)*(layer==="detail"?.78:1));
        addHandDrawnPenPath(ctx,points,width,nodes.distress?.seed||18,roughness);
      }
      ctx.fill();ctx.restore();return;
    }
    for (const layer of ["outline","structure","detail"]) {
      if(!contours.some(points=>(points.layer||"outline")===layer))continue;
      ctx.globalAlpha=opacity*(layer==="outline"?1:layer==="structure"?.95:.85);
      ctx.lineWidth=Math.max(1.1,edge.width*(layer==="outline"?profile.outlineWidth:profile.innerWidth));
      ctx.beginPath();
      for (const points of contours) {
      if((points.layer||"outline")!==layer)continue;
      if(profile.pressure>0){
        addPressurePenTracePath(ctx,points,ctx.lineWidth,profile.pressure,nodes.distress?.seed||18);
        continue;
      }
      const first = points[0], last = points[points.length-1];
      const closed=points.closed!==false;
      ctx.moveTo(closed?(last.x+first.x)/2:first.x,closed?(last.y+first.y)/2:first.y);
      for (let i = closed?0:1; i < points.length-(closed?0:1); i++) {
        const a = points[i], b = points[(i+1)%points.length];
        ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
      }
      if(closed)ctx.closePath();else ctx.lineTo(last.x,last.y);
      }
      if(profile.pressure>0){ctx.fillStyle=ctx.strokeStyle;ctx.fill();}else ctx.stroke();
    }
    if(quality>=1920&&contours.printTexture)drawPenTracePrintTexture(ctx,contours.printTexture,opacity);
  }
  ctx.restore();
}
