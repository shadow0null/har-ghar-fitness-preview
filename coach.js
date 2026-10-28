/** Original vector trainer artwork. Approximate motion motifs are not instructional demonstrations. */
export const MOTIONS=['jack','squat','lunge','run','push','plank','crunch','bridge','arm','stretch','twist','kick','step','raise','still'];
export function motionFor(name=''){
 const n=String(name).toLowerCase();
 if(/jumping jack|star jump|side hop|cross jack/.test(n))return 'jack';
 if(/squat|wall sit|chair pose/.test(n))return 'squat';
 if(/lunge|split squat/.test(n))return 'lunge';
 if(/push.up|burpee|dip|tricep/.test(n))return 'push';
 if(/plank|mountain climb|spider crawl/.test(n))return 'plank';
 if(/crunch|sit.up|v.up|russian twist|bicycle|windshield wiper|heel touch|in & outs|leg in/.test(n))return 'crunch';
 if(/bridge|hip thrust|glute|frog pump|superman|hyperextension|back arch|back bow|hip hinge/.test(n))return 'bridge';
 if(/run|jog|high knee|march|butt kick|skipping without rope/.test(n))return 'run';
 if(/arm circle|shoulder roll|arm raise|punch|boxing|chest press|rhomboid|snow angel|arm scissors|floor y raise|floor slide|shoulder gator|hook|curl|elbows back|back bow pull/.test(n))return 'arm';
 if(/stretch|cobra|child.s pose|yoga|reach|cat cow/.test(n))return 'stretch';
 if(/twist|rotation|rotate|windmill/.test(n))return 'twist';
 if(/kick|leg swing|donkey|flutter|fire hydrant/.test(n))return 'kick';
 if(/step|stair|climb|walk|calf raise|calf hop/.test(n))return 'step';
 if(/leg raise|leg lift|lateral raise|side raise|side leg circle|bent knee side hip/.test(n))return 'raise';
 return 'still';
}
export function coachMarkup(name, {compact=false,paused=false,rest=false}={}){
 const motion=motionFor(name);
 return `<div class="coach-stage ${compact?'coach-compact':''} ${rest?'coach-rest':''}" data-coach data-motion="${motion}" data-paused="${paused}">
 <div class="coach-halo halo-a"></div><div class="coach-halo halo-b"></div>
 <svg viewBox="0 0 360 345" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Original illustrative coach motion, not an approved exercise demonstration">
 <ellipse cx="180" cy="312" rx="88" ry="11" fill="#1d4d8e" opacity=".10"/>
 <g data-part="rig">
  <line data-part="leg-l" x1="160" y1="203" x2="149" y2="270" stroke="#183355" stroke-width="26" stroke-linecap="round"/>
  <line data-part="leg-l2" x1="149" y1="270" x2="140" y2="302" stroke="#183355" stroke-width="23" stroke-linecap="round"/>
  <line data-part="leg-r" x1="200" y1="203" x2="211" y2="270" stroke="#193a61" stroke-width="26" stroke-linecap="round"/>
  <line data-part="leg-r2" x1="211" y1="270" x2="220" y2="302" stroke="#193a61" stroke-width="23" stroke-linecap="round"/>
  <path data-part="shorts" d="M154 184 Q180 194 206 184 L209 214 L181 222 L151 214Z" fill="#17324c"/>
  <line data-part="arm-l" x1="148" y1="112" x2="121" y2="160" stroke="#ba7852" stroke-width="19" stroke-linecap="round"/>
  <line data-part="arm-l2" x1="121" y1="160" x2="124" y2="203" stroke="#cc8b61" stroke-width="17" stroke-linecap="round"/>
  <line data-part="arm-r" x1="212" y1="112" x2="239" y2="160" stroke="#ba7852" stroke-width="19" stroke-linecap="round"/>
  <line data-part="arm-r2" x1="239" y1="160" x2="236" y2="203" stroke="#cc8b61" stroke-width="17" stroke-linecap="round"/>
  <path data-part="torso" d="M150 108 Q180 98 210 108 L207 192 Q180 199 153 192Z" fill="#10a1a7" stroke="#09788b" stroke-width="2"/>
  <path data-part="stripe" d="M161 114 L177 188" stroke="#a3f1e6" opacity=".45" stroke-width="6" stroke-linecap="round"/>
  <path data-part="neck" d="M171 93 L171 109 L189 109 L189 93" fill="#bc825d"/>
  <ellipse data-part="head" cx="180" cy="66" rx="30" ry="35" fill="#d49b72"/>
  <path data-part="hair" d="M151 61 Q146 24 181 25 Q213 22 210 65 Q198 50 195 42 Q170 57 153 53Z" fill="#192c38"/>
  <circle data-part="eye-l" cx="168" cy="72" r="2.4" fill="#21343e"/>
  <circle data-part="eye-r" cx="192" cy="72" r="2.4" fill="#21343e"/>
  <path data-part="smile" d="M172 85 Q181 90 189 84" fill="none" stroke="#8e513c" stroke-width="2.3" stroke-linecap="round"/>
  <path data-part="shoe-l" d="M123 300 Q138 290 150 296 L164 306 Q165 313 158 313 L121 313 Q116 308 123 300Z" fill="#f8fcff" stroke="#8bbacf" stroke-width="2"/>
  <path data-part="shoe-r" d="M196 306 L210 294 Q227 291 238 303 Q244 312 236 313 L203 313 Q194 313 196 306Z" fill="#f8fcff" stroke="#8bbacf" stroke-width="2"/>
 </g></svg><div class="coach-caption">ORIGINAL MOTION PREVIEW <span>·</span> NOT FORM INSTRUCTION</div></div>`;
}
const line=(e,a,b)=>{e.setAttribute('x1',a[0].toFixed(1));e.setAttribute('y1',a[1].toFixed(1));e.setAttribute('x2',b[0].toFixed(1));e.setAttribute('y2',b[1].toFixed(1))};
const p=(x,y)=>[x,y];
const lerp=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>p(lerp(a[0],b[0],t),lerp(a[1],b[1],t));
function pose(svg,motion,time){
 const parts={};svg.querySelectorAll('[data-part]').forEach(e=>parts[e.dataset.part]=e);
 const sin=Math.sin(time*2.9), swing=(1-Math.cos(time*2.9))/2, slow=Math.sin(time*1.4);
 let centerX=180,y=0,spread=0,raise=0,squat=0,armSwing=0,kneeL=0,kneeR=0,twist=0;
 switch(motion){
  case 'jack':raise=swing;spread=49*swing;y=-14*swing;break;
  case 'squat':squat=52*swing;spread=17+15*swing;break;
  case 'lunge':squat=27*swing;spread=21;kneeL=18*swing;kneeR=-12*swing;break;
  case 'run':armSwing=sin*29;kneeL=24*Math.max(0,sin);kneeR=24*Math.max(0,-sin);y=-9*swing;break;
  case 'push':squat=15*swing;armSwing=-21*swing;raise=.35*swing;break;
  case 'plank':armSwing=8*sin;raise=.2;break;
  case 'crunch':squat=15*swing;raise=.35*swing;twist=15*sin;break;
  case 'bridge':squat=-21*swing;kneeL=12*swing;kneeR=12*swing;break;
  case 'arm':raise=.6+.25*sin;armSwing=18*sin;break;
  case 'stretch':raise=.85+.13*swing;twist=8*slow;break;
  case 'twist':twist=15*sin;raise=.3;break;
  case 'kick':kneeL=25*Math.max(0,sin);kneeR=25*Math.max(0,-sin);break;
  case 'step':kneeL=19*Math.max(0,sin);kneeR=19*Math.max(0,-sin);y=-7*swing;break;
  case 'raise':spread=19*swing;raise=.4*swing;break;
  default: y=2*Math.sin(time*1.1);armSwing=3*sin;
 }
 const shoulderL=p(148+twist,y+112+squat*.15),shoulderR=p(212+twist,y+112+squat*.15),headY=y+squat*.15;
 const hipL=p(158,203+y+squat),hipR=p(202,203+y+squat);
 const elbowL=p(121-43*raise-armSwing,y+159-71*raise+squat*.15),elbowR=p(239+43*raise+armSwing,y+159-71*raise+squat*.15);
 const wristL=p(124-75*raise-armSwing*1.4,y+205-173*raise+squat*.15),wristR=p(236+75*raise+armSwing*1.4,y+205-173*raise+squat*.15);
 const kneeLeft=p(150-spread*.58-kneeL,y+267+squat*.30-kneeL),kneeRight=p(210+spread*.58+kneeR,y+267+squat*.30-kneeR);
 const footL=p(141-spread-kneeL*.45,302-kneeL*.23),footR=p(219+spread+kneeR*.45,302-kneeR*.23);
 for(const [k,a,b] of [['arm-l',shoulderL,elbowL],['arm-l2',elbowL,wristL],['arm-r',shoulderR,elbowR],['arm-r2',elbowR,wristR],['leg-l',hipL,kneeLeft],['leg-l2',kneeLeft,footL],['leg-r',hipR,kneeRight],['leg-r2',kneeRight,footR]])line(parts[k],a,b);
 parts.torso.setAttribute('d',`M${shoulderL[0]} ${shoulderL[1]} Q180 ${shoulderL[1]-12} ${shoulderR[0]} ${shoulderR[1]} L${hipR[0]+5} ${hipR[1]-11} Q180 ${hipL[1]-4} ${hipL[0]-5} ${hipL[1]-11}Z`);
 parts.shorts.setAttribute('d',`M153 ${hipL[1]-16} Q180 ${hipL[1]-6} 207 ${hipR[1]-16} L210 ${hipR[1]+10} L180 ${hipL[1]+18} L150 ${hipL[1]+10}Z`);
 parts.stripe.setAttribute('d',`M${shoulderL[0]+13} ${shoulderL[1]+7} L${hipL[0]+20} ${hipL[1]-13}`);
 for(const k of ['head','hair','eye-l','eye-r','smile','neck'])parts[k].setAttribute('transform',`translate(${twist*.75} ${headY})`);
 parts['shoe-l'].setAttribute('transform',`translate(${footL[0]-141} ${footL[1]-302})`);
 parts['shoe-r'].setAttribute('transform',`translate(${footR[0]-219} ${footR[1]-302})`);
}
let raf=0;
export function animateCoaches(){if(raf)return;let last=0;const frame=t=>{raf=requestAnimationFrame(frame);if(document.hidden||t-last<33)return;last=t;document.querySelectorAll('[data-coach]').forEach(stage=>{
  if(stage.closest('.lottie-loaded')||stage.dataset.paused==='true'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const svg=stage.querySelector('svg');if(!svg)return;
  pose(svg,stage.dataset.motion,t/1000+(stage.classList.contains('coach-compact')?.3:0));
 });};raf=requestAnimationFrame(frame)}
