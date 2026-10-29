/** Local SVG playback for the shape-only Lottie compositions bundled with licensed media.
 * Supports path morphing, fills, simple gradients, nested transforms and precomps.
 * Not an implementation of every Lottie feature; unsupported effects are reported.
 * No network dependency or third-party JavaScript runtime.
 */
const SVG='http://www.w3.org/2000/svg';
const cache=new Map();let active=[];let running=false;
function kick(){if(!running){running=true;requestAnimationFrame(loop)}}
function node(name,attrs={}){const e=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e}
function lerp(a,b,f){return a+(b-a)*f}
function interpolate(a,b,f){
 if(typeof a==='number'&&typeof b==='number')return lerp(a,b,f);
 if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length)return a.map((v,i)=>interpolate(v,b[i],f));
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a.v)&&Array.isArray(b.v)&&a.v.length===b.v.length)
  return {v:interpolate(a.v,b.v,f),i:interpolate(a.i,b.i,f),o:interpolate(a.o,b.o,f),c:a.c};
 return a;
}
export function at(prop,frame){
 if(!prop)return 0;
 if(prop.a!==1)return prop.k;
 const k=prop.k;if(!Array.isArray(k)||!k.length)return k;
 let i=0;while(i+1<k.length&&k[i+1].t<=frame)i++;
 const start=k[i],end=k[i+1];let a=start.s, b=start.e??end?.s;
 if(!end||start.h===1||!b)return Array.isArray(a)&&a.length===1&&a[0]?.v?a[0]:a;
 let f=Math.min(1,Math.max(0,(frame-start.t)/(end.t-start.t||1)));
 // Approximate temporal cubic easing for source interpolation handles.
 const oo=start.o,ii=end.i;
 if(oo&&ii&&typeof oo.x==='number'&&typeof ii.x==='number'){
  const x1=oo.x,x2=ii.x,y1=oo.y,y2=ii.y;
  let u=f;for(let n=0;n<5;n++){const x=3*(1-u)*(1-u)*u*x1+3*(1-u)*u*u*x2+u*u*u;
   const dx=3*(1-u)*(1-u)*x1+6*(1-u)*u*(x2-x1)+3*u*u*(1-x2);
   if(dx>0.01)u=Math.min(1,Math.max(0,u-(x-f)/dx));}
  f=3*(1-u)*(1-u)*u*y1+3*(1-u)*u*u*y2+u*u*u;
 }
 if(Array.isArray(a)&&a.length===1&&a[0]?.v){a=a[0];if(Array.isArray(b)&&b.length===1)b=b[0]}
 return interpolate(a,b,f);
}
const scalar=(p,t,def=0)=>{const v=at(p,t);return Number.isFinite(+v)?+v:def};
const vec=(p,t,def=[0,0])=>{const v=at(p,t);return Array.isArray(v)?v:def};
const fmt=n=>Number((+n||0).toFixed(2));
export function makePath(sh){
 if(!sh||!sh.v?.length)return '';
 const n=sh.v.length, c=sh.c;let s=`M${fmt(sh.v[0][0])} ${fmt(sh.v[0][1])}`;
 for(let j=1;j<n+(c?1:0);j++){
  const i=j-1,k=j%n,from=sh.v[i],to=sh.v[k],out=sh.o[i],inn=sh.i[k];
  s+=` C${fmt(from[0]+out[0])} ${fmt(from[1]+out[1])} ${fmt(to[0]+inn[0])} ${fmt(to[1]+inn[1])} ${fmt(to[0])} ${fmt(to[1])}`;
 }
 return s+(c?'Z':'');
}
function color(v){if(!Array.isArray(v))return '#222';return '#'+v.slice(0,3).map(x=>Math.round(Math.max(0,Math.min(1,x))*255).toString(16).padStart(2,'0')).join('')}
function transform(tr,t){
 if(!tr)return '';
 const p=vec(tr.p,t),a=vec(tr.a,t),s=vec(tr.s,t,[100,100]),r=scalar(tr.r||tr.rz,t);
 return `translate(${fmt(p[0])} ${fmt(p[1])}) rotate(${fmt(r)}) scale(${fmt(s[0]/100)} ${fmt(s[1]/100)}) translate(${fmt(-a[0])} ${fmt(-a[1])})`;
}
// Geometric source shapes used by the original UI loaders/confetti.
function geometryPath(x,t){
 const p=vec(x.p,t),s=vec(x.s,t),x0=p[0]||0,y0=p[1]||0;
 if(x.ty==='el'){
  const rx=Math.max(0,(s[0]||0)/2),ry=Math.max(0,(s[1]||0)/2),k=.5522847498;
  if(!rx||!ry)return '';
  return `M${fmt(x0+rx)} ${fmt(y0)} C${fmt(x0+rx)} ${fmt(y0+k*ry)} ${fmt(x0+k*rx)} ${fmt(y0+ry)} ${fmt(x0)} ${fmt(y0+ry)} C${fmt(x0-k*rx)} ${fmt(y0+ry)} ${fmt(x0-rx)} ${fmt(y0+k*ry)} ${fmt(x0-rx)} ${fmt(y0)} C${fmt(x0-rx)} ${fmt(y0-k*ry)} ${fmt(x0-k*rx)} ${fmt(y0-ry)} ${fmt(x0)} ${fmt(y0-ry)} C${fmt(x0+k*rx)} ${fmt(y0-ry)} ${fmt(x0+rx)} ${fmt(y0-k*ry)} ${fmt(x0+rx)} ${fmt(y0)} Z`;
 }
 if(x.ty==='rc'){
  const w=Math.max(0,s[0]||0),h=Math.max(0,s[1]||0);
  const r=Math.min(w/2,h/2,Math.max(0,scalar(x.r,t))),l=x0-w/2,u=y0-h/2,right=l+w,bottom=u+h;
  return `M${fmt(l+r)} ${fmt(u)} H${fmt(right-r)} Q${fmt(right)} ${fmt(u)} ${fmt(right)} ${fmt(u+r)} V${fmt(bottom-r)} Q${fmt(right)} ${fmt(bottom)} ${fmt(right-r)} ${fmt(bottom)} H${fmt(l+r)} Q${fmt(l)} ${fmt(bottom)} ${fmt(l)} ${fmt(bottom-r)} V${fmt(u+r)} Q${fmt(l)} ${fmt(u)} ${fmt(l+r)} ${fmt(u)} Z`;
 }
 if(x.ty==='sr'){
  const n=Math.max(3,Math.min(64,Math.round(scalar(x.pt,t,5)))),outer=Math.max(0,scalar(x.or,t,5)),inner=Math.max(0,scalar(x.ir,t,outer/2));
  const rot=scalar(x.r,t,-90)*Math.PI/180,star=(x.sy===1);
  const total=star?n*2:n;let path='';
  for(let i=0;i<total;i++){
   const angle=rot+i*Math.PI*2/total-Math.PI/2;
   const r=star&&(i%2)?inner:outer;
   path+=(i===0?'M':'L')+fmt(x0+Math.cos(angle)*r)+' '+fmt(y0+Math.sin(angle)*r)+' ';
  }
  return path+'Z';
 }
 return '';
}
function renderShapes(shapes,root,anim,defs){
 const item=shapes||[],tr=item.find(x=>x.ty==='tr');
 const container=node('g');root.appendChild(container);
 if(tr)anim.push(t=>{container.setAttribute('transform',transform(tr,t));container.setAttribute('opacity',fmt(scalar(tr.o,t,100)/100))});
 const fill=item.find(x=>x.ty==='fl'||x.ty==='gf');const stroke=item.find(x=>x.ty==='st');
 let fillRef='none';let fillUpdate=()=>{};
 if(fill?.ty==='fl'){
  fillUpdate=t=>{fillRef=color(at(fill.c,t));container.setAttribute('fill',fillRef);container.setAttribute('fill-opacity',fmt(scalar(fill.o,t,100)/100))};
 }else if(fill?.ty==='gf'){
  const gid='g'+Math.random().toString(36).slice(2);const gr=node('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse'});defs.appendChild(gr);
  const stop1=node('stop',{'offset':'0%'}),stop2=node('stop',{'offset':'100%'});gr.append(stop1,stop2);
  fillRef=`url(#${gid})`;
  fillUpdate=t=>{
   const p=vec(fill.s,t),q=vec(fill.e,t);Object.entries({x1:fmt(p[0]),y1:fmt(p[1]),x2:fmt(q[0]),y2:fmt(q[1])}).forEach(([k,v])=>gr.setAttribute(k,v));
   const nums=vec(fill.g?.k,t);const n=fill.g?.p||2;
   const first=nums.slice(1,4),last=nums.slice((n-1)*4+1,(n-1)*4+4);
   stop1.setAttribute('stop-color',color(first));stop2.setAttribute('stop-color',color(last));container.setAttribute('fill',fillRef);
   container.setAttribute('fill-opacity',fmt(scalar(fill.o,t,100)/100));
  };
 }
 if(fill)anim.push(fillUpdate);
 // Lottie shape arrays list topmost groups first, unlike SVG painter's order.
 for(const x of [...item].reverse()){
  if(x.ty==='gr')renderShapes(x.it,container,anim,defs);
  if(['sh','el','rc','sr'].includes(x.ty)){
   const path=node('path',{'fill':fill?'inherit':'none','fill-rule':'nonzero'});container.appendChild(path);
   anim.push(t=>{path.setAttribute('d',x.ty==='sh'?makePath(at(x.ks,t)):geometryPath(x,t))});
   if(stroke){anim.push(t=>{path.setAttribute('stroke',color(at(stroke.c,t)));path.setAttribute('stroke-width',scalar(stroke.w,t,1));path.setAttribute('stroke-opacity',scalar(stroke.o,t,100)/100)})}
  }
 }
}
function renderLayer(layer,root,anim,defs,comps){
 const g=node('g');root.appendChild(g);
 if(layer.ks)anim.push(t=>{g.setAttribute('transform',transform(layer.ks,t));g.setAttribute('opacity',fmt(scalar(layer.ks.o,t,100)/100))});
 if(layer.ty===4)renderShapes(layer.shapes,g,anim,defs);
 if(layer.ty===0&&comps[layer.refId])for(const nested of [...comps[layer.refId]].reverse())renderLayer(nested,g,anim,defs,comps);
}
export function makeComposition(d){
 if(!d||!Array.isArray(d.layers)||!(d.w>0)||!(d.h>0)||!(d.fr>0))throw Error('Invalid animation composition');
 const svg=node('svg',{viewBox:`0 0 ${d.w} ${d.h}`,role:'img','aria-label':d.nm||'Exercise animation',preserveAspectRatio:'xMidYMid meet'});
 const defs=node('defs');svg.appendChild(defs);
 const anim=[];const comps=Object.fromEntries((d.assets||[]).filter(a=>a.layers).map(a=>[a.id,a.layers]));
 for(const layer of [...d.layers].reverse())renderLayer(layer,svg,anim,defs,comps);
 return {svg,frames:d.op-d.ip,fps:d.fr,render(t){for(const apply of anim)apply(t)},animations:anim.length,unhandledLayers:d.layers.filter(l=>![0,4].includes(l.ty)).length};
}
async function jsonFor(url){if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error(`Animation ${r.status}`);return r.json()}));return cache.get(url)}
export function loadAnimations(){
 active=[];
 for(const stage of document.querySelectorAll('[data-lottie-url]')){
  const url=stage.dataset.lottieUrl;
  jsonFor(url).then(d=>{
   if(!stage.isConnected)return;
   const comp=makeComposition(d);const holder=stage.querySelector('.lottie-canvas')||stage;
   holder.replaceChildren(comp.svg);stage.classList.add('lottie-loaded');comp.render(d.ip||0);
   active.push({stage,comp,ip:d.ip||0,loop:stage.dataset.loop!=='false',loadedAt:performance.now()});kick();
  }).catch(err=>{stage.dataset.error=String(err.message||err);stage.classList.add('lottie-error')});
 }
}

function loop(t){
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 active=active.filter(x=>x.stage.isConnected);
 for(const a of active){
  if(a.stage.dataset.paused==='true'||document.hidden||reduced)continue;
  const elapsed=(t-a.loadedAt)/1000*a.comp.fps;
  const frame=a.ip+(a.loop?elapsed%a.comp.frames:Math.min(a.comp.frames-0.01,elapsed));
  if(a.frame!==Math.floor(frame)){a.frame=Math.floor(frame);a.comp.render(frame)}
 }
 if(active.length)requestAnimationFrame(loop);else running=false;
}
