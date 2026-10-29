import {WorkoutEngine} from './engine.js';
import {coachMarkup,animateCoaches} from './coach.js';
import {loadAnimations} from './lottie-lite.js';
import {playSound,warmSounds,stopSounds} from './audio.js';
import {unescapeSourceText,applyTextFixes,textFlagsFor,labelFor,equipmentHints,restAfter,weeklyDays,animationStatus,isMissingExercise,findDuplicateNames,discoverRoutineFor,discoverDisplayTitle,muscleGroupsFor,displayName,difficultyBolts,levelClassName,groupConsecutiveSteps,focusMismatchSteps,labelTip,isCoverPhoto,parseDeepLink,focusTileCount,estimateMinutesLabel,dayTags,adjustPlannedDays,compareProgramDays,quickChipTag,isBeginnerCatalogItem} from './text-utils.js';
import {ACCOUNTS_KEY,SESSION_KEY,normalizeEmail,validateSignup,randomSaltHex,hashPassword,createAccountRecord,NB_STEPS,defaultNbAnswers,matchPlan,passwordStrength} from './auth.js';
const root=document.querySelector('#app'),KEY='hgf-evidence-v1';
const LOGO_SVG='<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><path d="M4 32 L32 6 L60 32" fill="none" stroke="#E67E22" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 30 V54 a2 2 0 0 0 2 2 H50 a2 2 0 0 0 2-2 V30" fill="none" stroke="#0F8A56" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="29" r="4.5" fill="#122A3A"/><g stroke="#122A3A" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M32 35 L25 27"/><path d="M32 35 L39 27"/><path d="M32 35 V45"/><path d="M32 45 L26 54"/><path d="M32 45 L38 54"/></g></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null,dataReady=false;
let mediaInfo={exercises:{}};let discoverAssets={workouts:{},modules:{},moduleChildren:{},collections:{},ui:{}};let authorized={reviews:{}};
let textFixes={typos:[],flags:[]};
let countMedia=0,countApproved=0,countFull=0,countPreview=0;
let dupNames=new Map();
// Discover assets are non-critical: start fetching now, apply when they land.
const discoverAssetsPromise=fetch('data/discover-assets.json').then(r=>r.ok?r.json():null).catch(()=>null);
const setLoadMsg=m=>{const el=document.querySelector('#loadMsg');if(el)el.textContent=m};
const setLoadProgress=p=>{const bar=document.querySelector('.loading-bar span');if(bar){bar.style.width=p+'%';bar.style.marginLeft='0';bar.style.animation='none'}};
/** Load all data in parallel, then join media onto the reference data.
 * The shell (onboarding or loading screen) is rendered before this runs,
 * so first paint does not wait on the 6.9 MB reference.json. */
async function loadData(){
 const refP=fetch('data/reference.json').then(async r=>{if(!r.ok)throw Error(r.status);return r.json()});
 const smallP=Promise.all([
  fetch('media/manifest.json').then(r=>r.ok?r.json():{exercises:{}}).catch(()=>({exercises:{}})),
  fetch('data/review-approvals.json').then(r=>r.ok?r.json():{reviews:{}}).catch(()=>({reviews:{}})),
  fetch('data/text-fixes.json').then(r=>r.ok?r.json():{typos:[],flags:[]}).catch(()=>({typos:[],flags:[]})),
 ]);
 try{
  const [media,auth,fixes]=await smallP;
  setLoadMsg('Loading exercise records…');setLoadProgress(35);
  mediaInfo=media;authorized=auth;textFixes=fixes;
  setLoadMsg('Loading workout programs…');
  data=await refP;
  setLoadMsg('Joining animations and guidance…');setLoadProgress(70);
  // Recover licensed artwork and English exercise guidance without claiming a professional review.
  for(const [id,m] of Object.entries(mediaInfo.exercises||{})){
   const e=data.exercises[id];if(!e)continue;
   e.media={url:m.url,format:'lottie',sha256:m.sha256,license:mediaInfo.licenseRecord};
   e.guidance=applyTextFixes(unescapeSourceText(m.instructions?.introduce)||null,textFixes);
   e.tips=(m.instructions?.tips||[]).map(t=>({type:t.type,text:labelTip(applyTextFixes(unescapeSourceText(t.text),textFixes))}));
   e.textFlags=textFlagsFor(id,textFixes);
   e.reviewStatus='media-available';countMedia++;
   const a=authorized.reviews?.[id];
   if(a?.mediaSha256===m.sha256&&a.guidanceChecked===true&&a.safetyChecked===true&&a.techniqueChecked===true&&a.reviewer&&a.reviewedAt){
    e.reviewStatus='approved';e.safety='Technique, guidance and safety reviewed by '+a.reviewer+' on '+a.reviewedAt;countApproved++;
   }
  }
  for(const e of Object.values(data.exercises))e.name=applyTextFixes(e.name,textFixes);
  for(const _p of data.programs)for(const _d of _p.days){if(canTrain(_d.steps))countFull++;else countPreview++;}
  setLoadProgress(90);
  dupNames=findDuplicateNames(data.exercises);
  programs=new Map(data.programs.map(p=>[p.id,p]));custom.forEach(p=>programs.set(p.id,p));
  dataReady=true;setLoadProgress(100);applyDeepLink();
 }catch(e){
  if(!dataReady){root.innerHTML='<p>Program data could not load. Serve this folder over HTTP and reload.</p>';throw e}
 }
}
let saved;try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{saved={}}
const prefs={goal:'Build consistency',level:'Beginner',frequency:3,comfort:'Standard',voice:true,effects:true,volume:0.55,rest:25,theme:'daylight',soundPack:'reference',...saved.prefs};
if(saved.prefs?.theme==='midnight'&&!saved.prefs?.themeChosen)prefs.theme='daylight'; // a saved Midnight that was never explicitly chosen falls back to the Light default
let history=saved.history||[],edits=saved.edits||{},custom=saved.custom||[],onboarded=saved.onboarded||false,ob=saved.ob||0;
// Local-only accounts live under a separate key (never the app data key).
// An account is a sign-in + profile marker on this device only: it does not
// partition the device's workout data, and it stores no plaintext password.
let accounts=[];try{accounts=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||'[]')}catch{accounts=[]}
if(!Array.isArray(accounts))accounts=[];
let session=null;try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')||JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{session=null}
if(session&&!accounts.some(a=>a.email===session.email))session=null;
const currentAccount=()=>session?accounts.find(a=>a.email===session.email)||null:null;
const saveAccounts=()=>{try{localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(accounts))}catch{}};
const clearSession=()=>{try{sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(SESSION_KEY)}catch{};session=null};
const saveSession=(email,remember)=>{session={email};try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));if(remember)localStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch{}};
let profile=saved.profile||null;
// A signed-in account that already finished onboarding keeps that state even
// if the app data key was wiped (Delete local data removes preferences and
// history, not the account): skip re-onboarding and go straight to Training.
if(session&&currentAccount()?.onboarded&&!onboarded&&history.length===0)onboarded=true;
// Auth / new-onboarding view. Null = normal app flow. The welcome gate shows
// only when there is no session, onboarding is incomplete and no history
// exists — so existing users (onboarded, or with history) never see it. It
// also covers a signed-up user who never finished onboarding: logging in
// from the gate resumes the new onboarding instead of the classic one.
let authView=null,authForm={values:{},errors:{}},nb=null;
let legalFrom=null; // previous screen to return to from a legal screen: 'welcome'|'login'|'signup'|'forgot'|'settings'

// ---- Legal screens: Terms of Service + Privacy Policy ----------------------
// Written from the app's REAL behaviour only: local-only storage keys, no
// server, no analytics, no ads, no tracking, share/feedback/export/delete
// exactly as implemented. No third-party sign-in exists, so none is promised.
const LEGAL_DOCS={
terms:{title:'Terms of Service',intro:'These terms cover using Har Ghar Fitness on this device. By using the app you agree to them.',sections:[
{h:'What this app is',p:'Har Ghar Fitness is a self-paced home workout app. It shows workout programs, exercises and guidance bundled in the app, and records your completed sessions on this device only.'},
{h:'Not medical advice',p:'Workouts are self-paced home exercise, not medical advice. Exercise technique in the app has not been independently professionally reviewed — the same warning shown before every workout. If you have a health condition, injury or pain, talk to a doctor before starting.'},
{h:'Exercise safely',p:'You are responsible for exercising safely. Stop immediately if you feel pain, dizziness, shortness of breath or discomfort, and do not push through pain. Use clear space, good footwear and a stable surface.'},
{h:'Your account lives on this device only',p:'Accounts are local-only: your name, email and a salted password hash live in this browser (localStorage key hgf-accounts-v1). There is no server, no sync and no password recovery by email — if you forget your password, create a new account or continue as a guest.'},
{h:'Content as bundled',p:'Program and exercise data is as bundled in the app. Some days are preview-only and some exercise demonstrations are unavailable; those steps are labelled honestly and are never recorded as done.'},
{h:'Changes',p:'These terms may change when the app changes. The version on this screen is the one that applies to the build you are using.'}]},
privacy:{title:'Privacy Policy',intro:'Short version: nothing leaves this device. Har Ghar Fitness has no server, no account on the internet, and no tracking.',sections:[
{h:'What is stored, and where',p:'Accounts: your name, email and a salted password hash (never your password itself) in localStorage key hgf-accounts-v1. Workouts and preferences: your history, settings and profile in localStorage key hgf-evidence-v1. Both live only in this device browser.'},
{h:'Nothing is uploaded',p:'No workout, profile or account data is uploaded to any server. There is no analytics, no advertising, no tracking and no third-party data sharing. Your data is not sold or shared with anyone.'},
{h:'Share and Feedback need your tap',p:'Share opens your device share sheet only when you tap it. Feedback opens WhatsApp to +919905166009 only when you tap it — nothing is sent automatically.'},
{h:'Export and delete',p:'Export downloads a file with your data to this device. Delete local data removes workout history and preferences from this device. Delete account (Settings, signed in) removes the account record and signs you out — it does not remove workout history or preferences, which only Delete local data removes.'},
{h:'No account recovery by email',p:'Because there is no server and no email system, there is no password reset by email. A forgotten password means a new local account or continuing as a guest.'}]}};

function legalScreen(doc){
  const d=LEGAL_DOCS[doc];
  return `<div class="onboard auth-page legal-doc"><button class="auth-back" data-action="legalBack">‹ Back</button><h1>${d.title}</h1><p class="muted">${d.intro}</p>${d.sections.map(s=>`<section class="legal-section"><h2>${s.h}</h2><p>${s.p}</p></section>`).join('')}<p class="auth-switch">${doc==='terms'?btn('Privacy Policy','openLegal','auth-link','data-doc="privacy"'):btn('Terms of Service','openLegal','auth-link','data-doc="terms"')}</p><div class="bottom"><button class="primary" data-action="legalBack">Back</button></div></div>`;
}
// Capture typed auth fields before leaving for a legal screen, so Back does
// not wipe what the user already typed (passwords are never kept).
function captureAuthForm(){
  const g=id=>document.getElementById(id);
  if(g('signupName'))authForm.values.signupName=g('signupName').value;
  if(g('signupEmail'))authForm.values.signupEmail=g('signupEmail').value;
  if(g('loginEmail'))authForm.values.loginEmail=g('loginEmail').value;
}
if(!session&&!onboarded&&history.length===0)authView='welcome';
else if(session&&!onboarded&&saved.nb&&!saved.nb.editing){nb={step:saved.nb.step||0,answers:{...defaultNbAnswers(),...(saved.nb.answers||{})},editing:false};authView='newOnboarding'}
// No auto-created empty custom workout may survive: purge 0-step customs
// saved by older builds (audit #30), and their orphaned edits.
{const purgedIds=custom.filter(p=>(p.days?.[0]?.steps?.length||0)===0&&!(edits[`${p.id}:0`]?.length>0)).map(p=>p.id);if(purgedIds.length){custom=custom.filter(p=>!purgedIds.includes(p.id));for(const k of Object.keys(edits))if(purgedIds.some(id=>k.startsWith(id+':')))delete edits[k];try{localStorage.setItem(KEY,JSON.stringify({prefs,history,edits,custom,onboarded,ob,checkpoint:saved.checkpoint||null,recent:recentlyViewed,profile}))}catch{}}}
let sessionLabel=saved.sessionLabel||null; // name shown in the player header: Discover entry name, or program title
let discoverFilter='all'; // Discover filter chip: 'all' or a module id (238/266/234/237/232/239)
let route={name:'training'},stack=[],body='ab',modal=null,active=null,draft=null,tab='Animation',notice='',checkpoint=saved.checkpoint||null,newCustomId=null;
let recentlyViewed=saved.recent||[],trainingQuery='',trainingQuick=null,challengeFilter='all';
const lastDayByProgram={};
let deepLink=parseDeepLink(typeof location!=='undefined'?location.search:'');
let sessionVoice=null,sessionEffects=null;
const voiceOn=()=>sessionVoice??prefs.voice, effectsOn=()=>sessionEffects??prefs.effects;
function applyDeepLink(){
 if(!dataReady||!onboarded)return false;
 if(deepLink.program&&programs.has(deepLink.program)){route={name:'detail',id:deepLink.program,day:lastDayByProgram[deepLink.program]||0};deepLink={...deepLink,program:null};return true}
 if(deepLink.exercise&&data.exercises[deepLink.exercise]){for(const p of data.programs){for(let d=0;d<p.days.length;d++){const i=p.days[d].steps.findIndex(s=>String(s.exerciseId)===String(deepLink.exercise));if(i>=0){active={p,steps:stepsFor(p.id,d),day:d};route={name:'exercise',index:i};deepLink={...deepLink,exercise:null};return true}}}}
 if(deepLink.tab&&['training','discover','meal','report','settings','plans'].includes(deepLink.tab)){route={name:deepLink.tab};deepLink={...deepLink,tab:null};return true}
 return false;
}
discoverAssetsPromise.then(d=>{if(d){Object.assign(discoverAssets,d);if(['discover','collection','catalog'].includes(route.name))render()}});
let programs=new Map();
function persist(){try{localStorage.setItem(KEY,JSON.stringify({prefs,history,edits,custom,onboarded,ob,checkpoint,sessionLabel,recent:recentlyViewed,profile,nb:nb&&!nb.editing?{step:nb.step,answers:nb.answers}:null}))}catch{notice='Saving failed: browser storage is unavailable or full.'}}
function record(s){if(!history.some(x=>x.id===s.id)){history.push(s);persist()}}
let priorPhase='',lastCue='';
function speak(text){if(!voiceOn()||!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-IN';u.volume=prefs.volume;window.speechSynthesis.speak(u)}
function beep(){playSound('tick',{...prefs,effects:effectsOn()})}
function silence(){window.speechSynthesis?.cancel()}
const engine=new WorkoutEngine({save:s=>{checkpoint=s;persist()},record,onChange:e=>{if(e.state!==priorPhase){silence();const cues={READY:'ready',EXERCISE:'start',REST:'rest',COMPLETED:'finish'};if(cues[e.state])playSound(cues[e.state],{...prefs,effects:effectsOn()});if(['EXERCISE','READY','REST','COMPLETED'].includes(e.state))speak(e.state==='EXERCISE'?ex(e.step.exerciseId).name:e.state==='READY'?'Get ready':e.state==='REST'?'Rest. Take your time.':'Preview finished');priorPhase=e.state}if(route.name==='player')render()}});
if(checkpoint&&engine.restore(checkpoint))route={name:'player'};
function ex(id){return data.exercises[id]||{id,name:`Exercise ${id}`,reviewStatus:'pending'}}
function title(p){const match=p.id.match(/^d_(ab|ar|ch|le|sh)_([123])$/);if(match)return `${({ab:'Abs',ar:'Arms',ch:'Chest',le:'Legs',sh:'Shoulders'})[match[1]]} · ${['','Beginner','Intermediate','Advanced'][match[2]]}`;
 const whole=p.id.match(/^7__4_(beginner|intermediate|advance)$/);if(whole)return `28-Day Full Body · ${{beginner:'Beginner',intermediate:'Intermediate',advance:'Advanced'}[whole[1]]}`;
 const upper=p.id.match(/^upper_([123])$/);if(upper)return `Upper Body · Program ${upper[1]}`;
 if(p.id==='lower'||p.id==='lower_new')return 'Lower Body · 28 Days'+(p.id==='lower_new'?' (Updated)':'');
 if(/^\d+$/.test(p.id))return `28-Day Program · Series ${Number(p.id)-489}`;
 if(p.id.startsWith('d_ch_1_'))return `Chest · Beginner Variant ${p.id.split('_').at(-1)}`;
 return p.title||`Program ${p.id.replaceAll('_',' ')}`}
function stepsFor(id,day){const p=programs.get(id);return structuredClone(edits[`${id}:${day}`]||p.days[day].steps)}
function reviewed(steps){return steps.length>0&&steps.every(s=>{const e=ex(s.exerciseId);return ['timed','reps'].includes(s.mode)&&e.reviewStatus==='approved'&&e.media?.url&&e.media?.license&&e.guidance&&e.safety})}
// Content completeness authorizes optional self-tracking, NOT a professional form-review claim.
function canTrain(steps){return steps.length>0&&steps.every(s=>{const e=ex(s.exerciseId);return ['timed','reps'].includes(s.mode)&&Number.isFinite(+s.value)&&+s.value>0&&e.media?.format==='lottie'&&e.media?.license&&e.guidance&&e.tips?.length>0})}
function btn(label,action,cls='secondary',extra=''){return `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`}
function go(next){capture();stack.push(route);route=next;modal=null;render();window.scrollTo(0,0)}
function capture(){route.scroll=window.scrollY;route.rails=[...document.querySelectorAll('.horizontal,.chips')].map(e=>e.scrollLeft)}
function back(){modal=null;if(route.name==='editor'&&newCustomId)newCustomId=null;if(route.name==='player'){engine.requestExit();return}route=stack.pop()||{name:'training'};if(route.name==='detail'&&lastDayByProgram[route.id]!=null)route.day=lastDayByProgram[route.id];render();requestAnimationFrame(()=>{window.scrollTo(0,route.scroll||0);document.querySelectorAll('.horizontal,.chips').forEach((e,i)=>e.scrollLeft=route.rails?.[i]||0)})}
function header(text,backButton=false,showSearch=false,searchAction=null){if(!backButton)return `<header class="header"><span class="brand-mark" aria-hidden="true">${LOGO_SVG}</span><h1 class="brand-title"><span>Har Ghar</span><span class="brand-green">Fitness</span></h1>${showSearch?btn('⌕',searchAction||'nav','header-search',searchAction?`aria-label="Search workouts"`:`data-name="discover" aria-label="Search workouts"`):''}</header>`;return `<header class="header">${btn('‹','back','','aria-label="Back"')}<span class="brand-mark" aria-hidden="true">${LOGO_SVG}</span><h1>${esc(text)}</h1></header>`}
const NAV_ICONS={training:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/></svg>',discover:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/></svg>',settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>'};
const navNames=['Training','Discover','Report','Settings'];function nav(){return `<nav class="nav" aria-label="Main">${navNames.map(n=>btn(`<b aria-hidden="true">${NAV_ICONS[n.toLowerCase()]}</b>${n}`,'nav',route.name===n.toLowerCase()?'selected':'',`data-name="${n.toLowerCase()}"`)).join('')}</nav>`}
function emptyMedia(id){
 const e=ex(id),paused=route.name==='player'&&['PAUSED','INTERRUPTED','EXIT_CONFIRMATION'].includes(engine.state);
 if(e.media?.format==='lottie'&&e.media.url){
  return `<div class="licensed-stage" data-lottie-url="${esc(e.media.url)}" data-paused="${paused}"><div class="lottie-canvas" role="img" aria-label="${esc(e.name)} animation"></div><div class="lottie-fallback">${coachMarkup(e.name,{paused})}</div><span class="licensed-label">▶ Licensed animation</span></div>`;
 }
 if(e.media?.url&&e.media?.format==='video')return `<video class="media" src="${esc(e.media.url)}" ${paused?'':'autoplay'} muted loop playsinline aria-label="${esc(e.name)} demonstration"></video>`;
 return `<div class="fallback-stage">${coachMarkup(e.name,{paused,rest:route.name==='player'&&engine.state==='REST'})}<p class="fallback-note">Original illustrative coach — not the licensed demonstration. No animation, name or instructions exist for this exercise in the source data.</p></div>`;
}
function value(s){return s.mode==='timed'?`${s.value} sec`:s.mode==='reps'?`× ${s.value}`:`${s.value} · unit unverified`}
function week(){const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));return history.filter(s=>s.completed&&new Date(s.finishedAt)>=start)}
function streak(){const days=new Set(history.filter(s=>s.completed).map(s=>new Date(s.finishedAt).toDateString()));let n=0;const d=new Date();if(!days.has(d.toDateString()))d.setDate(d.getDate()-1);while(days.has(d.toDateString())){n++;d.setDate(d.getDate()-1)}return n}
function weekMinutes(){const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));const mins=[0,0,0,0,0,0,0];for(const s of history.filter(s=>s.completed)){const f=new Date(s.finishedAt);if(f>=start)mins[(f.getDay()+6)%7]+=Math.round((s.activeMs||0)/60000)}return mins}
function trainingHeader(){
 return `<header class="header training-header"><div class="brand-row"><span class="brand-mark" aria-hidden="true">${LOGO_SVG}</span><h1 class="brand-title"><span>Har Ghar</span><span class="brand-green">Fitness</span></h1></div><div class="training-search"><span aria-hidden="true">⌕</span><input id="trainingSearch" type="search" placeholder="Search programs and exercises" aria-label="Search programs and exercises" autocomplete="off" value="${esc(trainingQuery)}"></div></header>`;
}
const QUICK_CHIPS=[['recent','Recent'],['burn','Burn Fat'],['stretch','Stretch'],['beginner','Beginner'],['equipment','With Equipment'],['short','Under 10 min'],['long','20+ min']];
function quickMatch(p){
 if(!trainingQuick)return true;
 if(trainingQuick==='recent')return recentlyViewed.includes(p.id);
 return !!dayTags(p,data.exercises)[quickChipTag(trainingQuick)];
}
// Planned days for the week: an explicit selection if one was saved at the
// current frequency, otherwise the evenly spread default. The sessions
// stepper preserves this list (see adjustPlannedDays) instead of recomputing
// it from scratch and discarding the user's days.
function plannedDayNames(){const d=prefs.plannedDays;return Array.isArray(d)&&d.length===prefs.frequency?d:weeklyDays(prefs.frequency)}
function findExerciseLocation(id){
 for(const p of data.programs){for(let d=0;d<p.days.length;d++){const i=p.days[d].steps.findIndex(s=>String(s.exerciseId)===String(id));if(i>=0)return {p,day:d,index:i}}}
 return null;
}
function applyTrainingSearch(){
 const box=document.querySelector('#trainingResults');if(!box)return;
 const q=trainingQuery.trim().toLowerCase();
 if(!q){box.innerHTML='';return}
 const progMatches=[...programs.values()].filter(p=>title(p).toLowerCase().includes(q)).slice(0,10);
 const exMatches=Object.values(data.exercises).filter(e=>e.bundledReference&&e.name.toLowerCase().includes(q)).slice(0,10);
 let html='<section class="search-results"><h2>Search results</h2>';
 if(progMatches.length)html+='<h3>Programs</h3>'+progMatches.map(p=>programRow(p)).join('');
 if(exMatches.length){
  html+='<h3>Exercises</h3>';
  for(const e of exMatches){
   const loc=findExerciseLocation(e.id);
   const sub=loc?('In '+esc(title(loc.p))+' · Day '+(loc.day+1)):'Not in a bundled program';
   html+=btn('<span class="grow"><h3>'+esc(e.name)+'</h3><small>'+sub+'</small></span><span>›</span>','exerciseSearch','row','data-id="'+e.id+'"');
  }
 }
 if(!progMatches.length&&!exMatches.length)html+='<p class="muted">Nothing matches that search.</p>';
 html+='</section>';
 box.innerHTML=html;
}
function challengeCard(p){
 const steps=stepsFor(p.id,0);
 const full=p.days.filter((dd,i)=>canTrain(stepsFor(p.id,i))).length;
 return `<article class="challenge-card"><div class="challenge-card-copy"><h3>${esc(title(p))}</h3><p>${steps.length} steps · ${estimateMinutesLabel(steps)} on Day 1 · ${full} of ${p.days.length} days fully mapped</p><small>28 days · ${difficultyBolts(p).level}</small></div>${btn('START DAY 1','challengeDay1','primary',`data-id="${esc(p.id)}"`)}</article>`;
}
function miniCard(p){
 const steps=stepsFor(p.id,0);
 return `<article class="mini-card">${btn(`<b>${esc(title(p))}</b><small>${steps.length} steps · ${estimateMinutesLabel(steps)}</small><span>Start →</span>`,'program','',`data-id="${esc(p.id)}"`)}</article>`;
}
function justForYouPrograms(){
 const lvl=prefs.level;
 const focus=[...programs.values()].filter(p=>p.days.length===1&&difficultyBolts(p).level===lvl);
 const whole=[...programs.values()].filter(p=>/^7__4_/.test(p.id)&&difficultyBolts(p).level===lvl);
 return [...focus,...whole].slice(0,8);
}
function stretchPrograms(){
 const m=data.modules.find(m=>m.id==='238');if(!m)return [];
 const out=[];
 for(const it of m.items){const r=discoverRoutineFor({id:it.target?.value,nameKey:it.nameKey,level:null},[...programs.keys()]);const p=programs.get(r.programId);if(p&&!out.includes(p))out.push(p)}
 return out.slice(0,8);
}
function popularPrograms(){
 return [...programs.values()].filter(p=>p.days.length===28).map(p=>({p,full:p.days.filter((dd,i)=>canTrain(stepsFor(p.id,i))).length})).sort((a,b)=>b.full-a.full).slice(0,6).map(x=>x.p);
}
function training(){
 const count=week().length;
 const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
 const weekDates=[0,1,2,3,4,5,6].map(i=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
 const doneDates=new Set(history.filter(s=>s.completed&&new Date(s.finishedAt)>=start).map(s=>new Date(s.finishedAt).toDateString()));
 const planned=plannedDayNames().map(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(d));
 let nextIdx=-1;for(const i of planned){if(!doneDates.has(weekDates[i].toDateString())){nextIdx=i;break}}
 const pct=prefs.frequency?Math.min(100,Math.round(count/prefs.frequency*100)):0;
 const phrases={ab:'Core',ar:'Upper body',ch:'Strength',le:'Lower body',sh:'Mobility'};
 let rows=[...programs.values()].filter(p=>p.id.startsWith(`d_${body}_`)).sort((a,b)=>a.id.localeCompare(b.id));
 if(trainingQuick)rows=rows.filter(p=>quickMatch(p));
 const focusRows=rows.map(p=>programRow(p)).join('')||'<p class="muted">No programs match this filter. Tap the chip again to clear it.</p>';
 const multi=[...programs.values()].filter(p=>p.days.length===28).sort((a,b)=>title(a).localeCompare(title(b)));
 const jfy=justForYouPrograms(),stretchProgs=stretchPrograms(),popular=popularPrograms();
 return trainingHeader()+`<main class="page training-page"><div id="trainingResults"></div><div class="banner"><img class="banner-photo" src="media/hero-training.webp" alt="" fetchpriority="high"><div class="banner-shade"></div><div class="banner-script">Fit Healthy<br>Happy</div><h2>Stronger days start here.</h2><p class="banner-motto">Small steps, every day.</p><p>${data.summary.bundledExercises} exercise records · ${data.summary.programs} programs · ${data.summary.days} days · ${data.summary.steps.toLocaleString()} steps</p>${btn('Explore programs  →','plans','primary')}</div><section class="rhythm-card"><div class="goal"><b>Weekly Goal</b><span class="goal-edit-wrap">${count} / ${prefs.frequency} sessions ${btn('✎','editGoal','goal-edit','aria-label="Edit weekly goal"')}</span><div class="week-strip">${weekDates.map((d,i)=>{const done=doneDates.has(d.toDateString());const cls=done?'done':(i===nextIdx?'next':'');return `<span class="${cls}"><b>${done?'✓':'MTWTFSS'[i]}</b><small>${d.getDate()}</small></span>`}).join('')}</div></div><div class="rhythm-progress" role="progressbar" aria-label="Weekly sessions completed" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div><p class="muted">✓ = day completed · outlined = your next planned day · planned days: ${weeklyDays(prefs.frequency).join(' · ')}</p></section><div class="focus-head"><h2>Choose your focus</h2><span class="focus-pill">${phrases[body]}</span></div><div class="chips">${Object.entries({ab:'Abs',ar:'Arms',ch:'Chest',le:'Legs',sh:'Shoulders'}).map(([id,n])=>btn(`${body===id?'✓ ':''}${n}`,'body',`chip ${body===id?'selected':''}`,`data-id="${id}"`)).join('')}</div><div class="chips quick-chips chip-wrap">${QUICK_CHIPS.map(([id,n])=>btn(n,'quickChip',`chip ${trainingQuick===id?'selected':''}`,`data-id="${id}"`)).join('')}</div><h2>Your workouts</h2><p class="tiny-note">Minutes = timed seconds + 3 seconds per repetition (estimate). For 28-day programs the figure is Day 1.</p>${focusRows}<section><div class="section-head-row"><h2>Challenges</h2>${btn('More >','challenges','secondary more-link')}</div><div class="horizontal challenge-carousel">${multi.map(p=>challengeCard(p)).join('')}</div></section><section><div class="section-head-row"><h2>Just For You</h2>${btn('More >','plans','secondary more-link')}</div><p class="muted">Routines at your level (${esc(prefs.level)}).</p><div class="horizontal">${jfy.map(p=>miniCard(p)).join('')}</div></section><section><div class="section-head-row"><h2>Stretch &amp; Warm Up</h2>${btn('More >','discoverModule','secondary more-link','data-id="238"')}</div><div class="horizontal">${stretchProgs.map(p=>miniCard(p)).join('')}</div></section><section><div class="section-head-row"><h2>Popular Goals</h2>${btn('More >','challenges','secondary more-link')}</div><p class="muted">Routines with the most fully mapped days.</p><div class="horizontal">${popular.map(p=>miniCard(p)).join('')}</div></section>${custom.length?`<h2>Custom workouts</h2>${custom.map(p=>programRow(p)).join('')}`:''}<section class="create-card"><h2>CREATE YOUR OWN</h2><p>Build a routine from the exercise library.</p>${btn('Create custom workout','custom','primary')}</section><p class="tiny-note">${countMedia} licensed animations · ${countFull} of ${countFull+countPreview} days fully mapped · ${countPreview} preview-only. Fully mapped routines track progress; preview-only routines don’t record history.</p></main>`+nav();
}
function challenges(){
 const cats=[['all','All'],['muscle','Build Muscle'],['weight','Lose Weight'],['fullbody','Full Body'],['abs','Abs'],['upper','Upper Body'],['lower','Lower Body']];
 let list=[...programs.values()].filter(p=>p.days.length===28);
 if(challengeFilter!=='all')list=list.filter(p=>dayTags(p,data.exercises)[challengeFilter]);
 return header('Challenges',true)+`<main class="page"><p class="muted">Categories are computed from each routine's Day 1: Build Muscle = most estimated time from repetitions; Lose Weight = cardio-leaning (a cardio move, timed movement at least a quarter of estimated time); Full Body / Abs / Upper Body / Lower Body = the Day 1 muscle groups. Minutes = timed seconds + 3 seconds per repetition (estimate).</p><div class="chips chip-wrap">${cats.map(([id,n])=>btn(n,'challengeFilter',`chip ${challengeFilter===id?'selected':''}`,`data-id="${id}"`)).join('')}</div><p class="muted" role="status">${list.length} programs</p>${list.length?`<div class="challenge-list">${list.map(p=>challengeCard(p)).join('')}</div>`:'<p class="muted">No challenges in this category yet.</p>'}</main>`;
}

function programRow(p){const steps=stepsFor(p.id,0);const d=difficultyBolts(p);const isCustom=p.id.startsWith('custom-');const level=isCustom?'Custom':d.level;const cls=isCustom?'lvl-custom':levelClassName(level);const t=title(p);const showBadge=!t.endsWith(' · '+level);const first=steps[0]?ex(steps[0].exerciseId):null;const thumb=first?.media?.format==='lottie'&&first.media.url?`<div class="thumb-stage" data-lottie-url="${esc(first.media.url)}" data-paused="true"><div class="lottie-canvas"><span class="thumb-loading" aria-hidden="true">◷</span></div></div>`:`<span class="tile program-tile ${cls}">${p.days.length>1?'28':steps.length}</span>`;return btn(`${thumb}<span class="grow"><h3>${esc(t)}</h3>${showBadge?`<span class="level-badge ${cls}">${esc(level)}</span>`:''}<small>${steps.length} exercise steps${p.days.length>1?' · 28 days':''} · ${estimateMinutesLabel(steps)}</small></span><span>›</span>`,'program','row',`data-id="${esc(p.id)}" aria-label="${esc(t)} · ${steps.length} steps · ${estimateMinutesLabel(steps)}"`)}

const moduleNames={'234':'Fast Workouts','237':'Picks for You','232':'For Beginners','238':'Sleep & Stretch','239':'Challenges','266':'Body Focus'};
function assetImage(asset,{fallback='◷',className='',loading='lazy'}={}){
 if(!asset?.url)return `<span class="image-fallback">${esc(fallback)}</span>`;
 return `<img class="${esc(className)}" src="${esc(asset.url)}" alt="" loading="${loading}" decoding="async" width="${+asset.width||450}" height="${+asset.height||300}">`;
}
function coverImage(asset,{fallback='◷',loading='lazy'}={}){
 // Covers must be real landscape photos. Small icons (92px) and square icon
 // art (420×420) are not covers: stretching one across a card crops it into
 // a tiny icon at the top edge (audit #26, Plank Challenge).
 if(!isCoverPhoto(asset))return `<span class="image-fallback"><span class="fallback-glyph">${esc(fallback)}</span><span class="fallback-label">No photo</span></span>`;
 return assetImage(asset,{fallback,loading});
}
function artworkFor(item,moduleId,index){
 const target=item.target||{type:3,value:item.id};
 const w=discoverAssets.workouts?.[String(target.value)]||{};
 const c=discoverAssets.collections?.[String(target.value)]||{};
 const m=discoverAssets.moduleChildren?.[String(moduleId)]?.[String(index)]||{};
 return w.coverimage||m.coverimage||m.icon||c.coverimage||w.icon||c.icon||null;
}
function card(item,moduleId='',index=0,variant='grid'){
 const target=item.target||{type:3,value:item.id};const image=artworkFor(item,moduleId,index);
 const record=data.catalog.find(x=>x.id===String(target.value));
 const title=discoverDisplayTitle({...item,nameKey:item.nameKey,level:record?.level});
 const sub=target.type===4?`Explore collection · Ref ${esc(String(target.value))}`:record?.seconds?`🕐 ${Math.ceil(Number(record.seconds)/60)} min · Ref ${esc(String(target.value))}`:`Workout guide · Ref ${esc(String(target.value))}`;
 const levelPill=target.type===4||!record?.level?'':`<span class="level-pill ${esc(String(record.level).toLowerCase())}">${esc(String(record.level).replace(/^\w/,c=>c.toUpperCase()))}</span>`;
 const eager=moduleId==='238';
 return `<article class="card ${variant}"><button class="card-open" data-action="catalog" data-id="${esc(target.value)}" data-type="${target.type}"><div class="cover ${image&&isCoverPhoto(image)?'has-photo':''}">${coverImage(image,{fallback:target.type===4?'↗':'◷',loading:eager?'eager':'lazy'})}<span class="cover-icon" aria-hidden="true">↗</span></div><div class="card-copy"><h3>${esc(title)}</h3><small>${sub}</small>${levelPill}</div></button>${target.type===4?btn('Explore','catalog','card-start secondary',`data-id="${esc(target.value)}" data-type="4"`):btn('Start','startCatalog','card-start secondary',`data-id="${esc(target.value)}"`)}</article>`;
}

function uiAnimation(name,className='ui-motion'){
 const url=discoverAssets.ui?.[name]?.url;
 return url?`<div class="${esc(className)}" data-lottie-url="${esc(url)}" data-loop="${name==='popper'?'false':'true'}" aria-hidden="true"><div class="lottie-canvas"></div></div>`:'';
}
function discover(){
 const equip=discoverAssets.modules?.['265']?.coverimage;
 const FOCUS_ICONS={chest:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 5h10v4a5 5 0 0 1-10 0V5z"/><path d="M12 5v14M9 21h6"/></svg>',arm_shoulder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 20V9a3 3 0 0 1 6 0v4"/><path d="M12 13h3a2.5 2.5 0 0 1 0 5H9"/></svg>',butt_leg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3v9l-2.5 9M15 3v9l2.5 9M9 12h6"/></svg>',six_pack:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M7 9h10M7 15h10M12 3v18"/></svg>'};
 const sections=['238','266','234','237','232','239'].map(id=>{
  const m=data.modules.find(m=>m.id===id);if(!m)return '';
  if(id==='238')return `<section class="discover-section" data-module="238"><div class="section-heading"><h2>Sleep &amp; Stretch</h2><span>${m.items.length} workouts</span></div><div class="discover-grid">${m.items.map((it,i)=>card(it,id,i)).join('')}</div></section>`;
  if(id==='266'){const focusTotal=m.items.reduce((sum,it)=>{const c=data.collections.find(x=>x.id===String(it.target?.value||it.id));return sum+(focusTileCount(c)||0)},0);return `<section class="discover-section" data-module="266"><div class="section-heading"><h2>${esc(moduleNames[id]||labelFor(m.nameKey))}</h2><span>${focusTotal} workouts</span></div><div class="focus-grid">${m.items.map(it=>{const c=data.collections.find(x=>x.id===String(it.target?.value||it.id));const key=c?.nameKey||it.nameKey||'';const n=focusTileCount(c);return btn(`<span class="focus-icon" aria-hidden="true">${FOCUS_ICONS[key]||'↗'}</span><b>${esc(labelFor(key))}</b>${n?`<small>${n} workouts</small>`:''}`,'collection','focus-tile',`data-id="${esc(it.target?.value||it.id)}"`)}).join('')}</div></section>`}
  const variant=(id==='237'||id==='234')?'row-card':'grid';
  const wrap=(id==='237'||id==='234')?'discover-rows':(id==='232'||id==='239')?'horizontal':'discover-grid';
  const items=id==='232'?m.items.filter(it=>{const rec=data.catalog.find(x=>x.id===String(it.target?.value||it.id));return isBeginnerCatalogItem(rec)}):m.items;
  return `<section class="discover-section" data-module="${id}"><div class="section-heading"><h2>${esc(moduleNames[id]||labelFor(m.nameKey))}</h2><span>${items.length} workouts</span></div><div class="${wrap}">${items.map((it,i)=>card(it,id,i,variant)).join('')}</div></section>`;
 }).join('');
 const itemCount=['238','266','234','237','232','239'].reduce((sum,id)=>{const m=data.modules.find(m=>m.id===id);if(!m)return sum;if(id==='232')return sum+m.items.filter(it=>{const rec=data.catalog.find(x=>x.id===String(it.target?.value||it.id));return isBeginnerCatalogItem(rec)}).length;return sum+m.items.length},0);
 const featured=data.catalog.filter(w=>isCoverPhoto(discoverAssets.workouts?.[String(w.id)]?.coverimage)).slice(0,8);
 const stayActive=data.collections.find(c=>c.id==='525');
 return header('DISCOVER',false,true,'focusSearch')+`<main class="page discovery"><div class="discover-intro"><div><div class="eyebrow">MOVE · STRETCH · RECOVER</div><h2>Find your next session</h2><p>Browse movement ideas and exercise collections.</p></div>${uiAnimation('arrow','discover-arrow')}</div><button class="explore-banner" data-action="collection" data-id="112"><div class="explore-banner-image">${assetImage(equip,{fallback:'↗'})}</div><div class="explore-banner-copy"><b>WITH EQUIPMENT</b><span>Explore collections <span aria-hidden="true">↗</span></span></div></button>${featured.length?`<section class="discover-section"><div class="section-heading"><h2>Featured</h2><span>${featured.length} covers</span></div><div class="horizontal">${featured.map(w=>card(w)).join('')}</div></section>`:''}${stayActive?`<button class="stay-active-card" data-action="collection" data-id="525"><span><b>Stay active</b><small>${stayActive.workoutIds.length} entries in this collection</small></span><span>Open →</span></button>`:''}<div class="browse-search"><span aria-hidden="true">⌕</span><input id="discoverSearch" type="search" placeholder="Search workouts" aria-label="Search workouts" autocomplete="off"><span id="discoverCount">${itemCount} titles</span></div><div class="chips discover-chips">${[['all','All'],['238','Sleep & Stretch'],['266','Body Focus'],['234','Fast Workouts'],['232','For Beginners'],['239','Challenges'],['237','Picks for You']].map(([id,n])=>btn(n,'discoverFilter',`chip ${discoverFilter===id?'selected':''}`,`data-id="${id}"`)).join('')}</div><div id="discoverSections">${sections}</div><p class="source-note">Titles are source catalog names. Every entry opens a bundled routine you can start.</p></main>`+nav();
}

function stepRows(ss){return groupConsecutiveSteps(ss).map(g=>{const s=g.step,e=ex(s.exerciseId);const thumb=e.media?.format==='lottie'&&e.media.url?`<div class="thumb-stage" data-lottie-url="${esc(e.media.url)}" data-paused="true"><div class="lottie-canvas"><span class="thumb-loading" aria-hidden="true">◷</span></div></div>`:`<span class="tile">${g.firstIndex+1}</span>`;return btn(`${thumb}<span class="grow"><h3>${g.firstIndex+1} · ${esc(displayName(e))}${isMissingExercise(e)?' · name unverified':''}</h3><small>${g.count>1?`× ${g.count} consecutive rounds · `:''}${value(s)} · rest ${restAfter(s)}s after · ${animationStatus(e)}</small></span><span>›</span>`,'exercise','row',`data-index="${g.firstIndex}"`)}).join('')}
function detail(){const p=programs.get(route.id),ss=stepsFor(p.id,route.day||0);active={p,steps:ss,day:route.day||0};lastDayByProgram[p.id]=route.day||0;const d=difficultyBolts(p);const fullDays=p.days.filter((dd,i)=>canTrain(stepsFor(p.id,i))).length;const mm=focusMismatchSteps(ss,(()=>{const m=p.id.match(/^d_(ab|ar|ch|le|sh)_/);return m?m[1]:null})(),data.exercises);const subtitle=p.days.length>1?`${ss.length} exercise steps · Day ${(route.day||0)+1} of ${p.days.length} · ${d.level}`:`${ss.length} exercise steps · ${d.level} · ${estimateMinutesLabel(ss)} estimated (timed movement + rep steps)`;
 return `<header class="header detail-header">${btn('‹','back','','aria-label="Back"')}<div class="detail-title"><h1>${esc(title(p))}</h1><small>${esc(subtitle)}</small></div>${btn('⌕','nav','header-search','data-name="discover" aria-label="Search workouts"')}</header><div class="detail-hero">${ss.length?emptyMedia(ss[0].exerciseId):''}<div class="detail-hero-cta">${btn(canTrain(ss)?'Start workout  →':'Preview only — no tracking  →','start','primary',ss.length?'':'disabled')}</div></div><main class="page detail-page">${(()=>{const eq=[],opt=[];for(const s of ss){const h=equipmentHints(ex(s.exerciseId).guidance,ex(s.exerciseId).tips);for(const x of h.setup)if(!eq.includes(x))eq.push(x);for(const x of h.optional)if(!opt.includes(x))opt.push(x)}return `<p class="muted">${eq.length?`Equipment mentioned in the source instructions: ${esc(eq.join(', '))}.`:'No equipment is mentioned in the source instructions.'}${opt.length?` Optional: ${esc(opt.join(', '))} — only if the source says the move is too easy.`:''}</p>`})()}${p.days.length>1&&fullDays<p.days.length/2?`<div class="notice">Only ${fullDays} of ${p.days.length} days are fully mapped — ${p.days.length-fullDays} days are preview-only. This program cannot be tracked day by day.</div>`:''}${mm.length?`<p class="muted">Source routine includes ${mm.map(x=>`${esc(x.name)} ×${x.count} (${esc(x.focus)})`).join(', ')} — steps from another focus area.</p>`:''}${(()=>{if(p.id!=='lower'&&p.id!=='lower_new')return '';const other=programs.get(p.id==='lower'?'lower_new':'lower');if(!other)return '';const c=compareProgramDays(p,other);return `<p class="muted">Compared with ${esc(title(other))}: ${c.daysDiffer} of ${c.days} days use different exercises or values${c.day1Same?' — Day 1 is identical':''}.</p>`})()}<div class="actions">${btn('Edit routine','edit','secondary')}${btn('View first motion','exercise','secondary','data-index="0" '+(!ss.length?'disabled':''))}</div>${p.days.length>1?`<h2>Choose your day</h2><div class="calendar">${p.days.map((dd,i)=>{const ok=canTrain(stepsFor(p.id,i));return btn(String(i+1)+(ok?'':' ○'),'day',(i===active.day?'selected':'')+(ok?'':' preview-day'),`data-day="${i}"`)}).join('')}</div><div class="legend"><span class="mapped">● Fully mapped day</span><span aria-hidden="true">·</span><span class="preview">○ Preview-only day</span><span aria-hidden="true">·</span><span>${fullDays} of ${p.days.length} days fully mapped</span></div>`:''}<h2>Step list <small>${ss.length} steps</small></h2><div class="step-grid">${stepRows(ss)}</div><div class="dock-spacer"></div><div class="dock">${btn(canTrain(ss)?'Start workout  →':'Preview only — no tracking  →','start','primary',ss.length?'':'disabled')}<p class="muted">${ss.filter(s=>ex(s.exerciseId).media?.format==='lottie').length} of ${ss.length} steps include licensed animations. ${canTrain(ss)?'Workout history is available for this fully mapped routine; media is not independently form-reviewed.':'Some demonstrations are missing, so only a non-recording preview is available.'}</p></div></main>`+nav()}

function exercise(){const s=active.steps[route.index],e=ex(s.exerciseId);return header(displayName(e),true)+`<main class="page">${emptyMedia(e.id)}<div class="tabs">${['Animation','Muscle','How to Do'].map(t=>btn(t,'tab',tab===t?'selected':'',`data-tab="${t}"`)).join('')}</div><div class="field"><b>${s.mode==='reps'?'REPS':'DURATION'}</b><b>${value(s)}</b></div>${(()=>{const h=equipmentHints(e.guidance,e.tips);const parts=[];if(h.setup.length)parts.push(`Equipment mentioned in the source instructions: ${esc(h.setup.join(', '))}.`);if(h.optional.length)parts.push(`Optional: ${esc(h.optional.join(', '))} — only if the source says the move is too easy.`);if(!h.setup.length&&!h.optional.length)parts.push('No equipment is mentioned in the source instructions.');return `<p class="muted">${parts.join(' ')}</p>`})()}${e.textFlags?.length?`<div class="notice">${e.textFlags.map(f=>esc(f)).join(' ')}</div>`:''}${tab==='Muscle'?`<h2>Focus areas</h2>${(()=>{const focusLabel=active?.p?(({ab:'Abs & Core',ar:'Arms',ch:'Chest',le:'Legs',sh:'Shoulders'})[active.p.id.match(/^d_(ab|ar|ch|le|sh)_/)?.[1]]||(active.p.id.startsWith('7__4_')||/^\d+$/.test(active.p.id)?'Full Body':active.p.id.startsWith('upper')?'Upper Body':active.p.id.startsWith('lower')?'Lower Body':null)):null;const mg=muscleGroupsFor(e,focusLabel);return `${mg.guidancePhrase?`<p>Source guidance says this works the ${esc(mg.guidancePhrase)}.</p>`:''}<div class="muscle-chips">${mg.groups.map(g=>`<span>${esc(g)}</span>`).join('')}</div><p class="muted">Standard groups for these movements, from the exercise name and the source muscle IDs. No muscle diagram is available.</p><p class="source-line">Source muscle IDs: ${esc(mg.sourceIds.join(', ')||'not recorded')}.</p>`})()}`:tab==='How to Do'?`<h2>Instructions</h2><p>${esc(e.guidance||'Source exercise instructions are not available for this exercise.')}</p><h2>Exercise tips</h2>${e.tips?.length?`<ul class="exercise-tips">${e.tips.map(x=>`<li>${esc(x.text)}</li>`).join('')}</ul>`:'<p>Tips not provided for this exercise.</p>'}<p class="muted">Source instructions, not a verified clinical or professional review.</p>`:`<p>${e.media?.url?'Licensed animation from the project owner’s APK.':'No APK animation, name or instructions exist for this exercise in the source — it is preview-only.'}</p>`}<p class="source-line">Source exercise ${esc(e.id)} · ${e.media?.url?'Licensed animation':'No animation in the source data'} · No professional review documented.</p><div class="actions">${btn('Previous','pageExercise','secondary',`data-delta="-1" ${route.index===0?'disabled':''}`)}<span style="align-self:center;text-align:center;min-width:44px">${route.index+1}/${active.steps.length}</span>${btn('Next','pageExercise','secondary',`data-delta="1" ${route.index===active.steps.length-1?'disabled':''}`)}</div>${btn('Close','back','primary')}</main>`}
function plans(){return header('Program library',true)+`<main class="page"><p>23 bundled 28-day configurations (644 days) plus 17 single-day programs (17 days) make up the 40 programs and 661 days in total. ${countFull} days are fully mapped; ${countPreview} days are preview-only. Numeric IDs retain their source identity because their runtime labels are unverified. Minutes shown are Day-1 estimates: timed seconds + 3 seconds per repetition.</p><p class="tiny-note">⚡ Difficulty: 1 bolt Beginner · 2 Intermediate · 3 Advanced. Focus programs use their level; 28-day Series use Day-1 size (≤15 steps Beginner, 16–25 Intermediate, 26+ Advanced).</p><h2>28-day programs</h2>${data.programs.filter(p=>p.days.length===28).map(programRow).join('')}<h2>Single-day focus programs</h2>${data.programs.filter(p=>p.days.length===1).map(programRow).join('')}</main>`+nav()}
function editor(){return header('Edit workout',true)+`<main class="page"><div class="notice">Editing rules are original implementation choices where reference behavior has not been verified.</div>${draft.map((s,i)=>`<div class="editor-row"><h3>${i+1}. ${esc(ex(s.exerciseId).name)}</h3><label>Value <input aria-label="Exercise ${i+1} value" type="number" min="1" max="3600" value="${s.value}" data-step="${i}"></label> <small>${s.mode==='timed'?'seconds':'repetitions'}</small><div class="controls">${btn('Replace','replace','',`data-index="${i}"`)}${btn('Remove','remove','',`data-index="${i}"`)}${btn('↑','move','',`data-index="${i}" data-delta="-1" aria-label="Move up" ${i===0?'disabled':''}`)}${btn('↓','move','',`data-index="${i}" data-delta="1" aria-label="Move down" ${i===draft.length-1?'disabled':''}`)}</div></div>`).join('')}<div class="actions">${btn('+ Add','add','secondary')}${btn('Restore defaults','defaults','secondary')}</div>${btn('Save changes','saveEdit','primary',draft.length?'':'disabled')}${custom.some(p=>p.id===active.p.id)?btn('Delete this custom workout','deleteCustom','danger'):''}${btn('Discard changes','cancelEdit','secondary')}</main>`}
function picker(){return `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-label="Choose exercise"><h2>Choose exercise</h2><input class="search" id="search" placeholder="Search names or IDs" aria-label="Search exercise"><div class="picker" id="picker">${pickerRows('')}</div>${btn('Cancel','closeModal','secondary')}</section></div>`}
function pickerRows(q){return Object.values(data.exercises).filter(e=>e.bundledReference&&`${e.name} ${e.id}`.toLowerCase().includes(q.toLowerCase())).filter(e=>prefs.comfort!=='Avoid jumping'||!(/jump|hop|burpee/i.test(e.name))).map(e=>btn(`<span class="grow"><h3>${esc(e.name)}</h3><small>ID ${e.id} · ${animationStatus(e)}</small></span>`,'pick','row',`data-id="${e.id}"`)).join('')}
function collection(){
 const c=data.collections.find(c=>c.id===route.id);
 const art=discoverAssets.collections?.[String(route.id)]?.coverimage;
 return header(labelFor(c?.nameKey||'Collection'),true)+`<main class="page collection-page"><div class="collection-hero">${coverImage(art,{fallback:'↗'})}<div class="collection-hero-label"><b>${esc(labelFor(c?.nameKey||'Collection'))}</b><small>${(c?.workoutIds||[]).length} available entries</small></div></div><h2>Explore workouts</h2><div class="catalog-grid">${(c?.workoutIds||[]).map(id=>data.catalog.find(w=>w.id===id)).filter(Boolean).map(w=>card(w)).join('')}</div><p class="source-note">Every card opens a bundled routine you can start.</p></main>`+nav();
}
function catalog(){
 const w=data.catalog.find(w=>w.id===route.id),art=discoverAssets.workouts?.[String(route.id)]||{};
 const hero=art.coverimage||art.icon;
 const routine=discoverRoutineFor(w,[...data.programs.map(p=>p.id)]);
 const p=programs.get(routine.programId),ss=stepsFor(p.id,0);
 active={p,steps:ss,day:0};
 active.discoverName=discoverDisplayTitle(w);
 const mapped=ss.filter(s=>ex(s.exerciseId).media?.format==='lottie').length;
 return header(discoverDisplayTitle(w),true)+`<main class="page catalog-page"><div class="catalog-hero">${coverImage(hero,{fallback:'◷'})}</div><div class="catalog-intro"><h2>${esc(discoverDisplayTitle(w))}</h2><div class="catalog-badges"><span>${esc(w?.level||'Level unspecified')}</span>${w?.seconds?`<span>${Math.ceil(Number(w.seconds)/60)} minutes</span>`:''}${w?.count?.length?`<span>${w.count.join(' / ')} steps reported</span>`:''}</div><p>Reference catalog ID ${esc(route.id)} · source cover and icon matched by ID.</p></div><section class="catalog-routine"><h2>Plays this routine</h2><p class="muted">${esc(routine.note)}</p><p><b>${esc(title(p))}</b> · Day 1 · ${ss.length} steps · ${mapped} of ${ss.length} with licensed animations.</p><div class="actions">${btn('View full program  →','program','secondary',`data-id="${esc(p.id)}"`)}</div></section><h2>Step list <small>${ss.length} steps</small></h2><div class="step-grid">${stepRows(ss)}</div><div class="dock">${btn(canTrain(ss)?'Start workout  →':'Preview only — no tracking  →','start','primary')}<p class="muted">${canTrain(ss)?'Workout history is available for this fully mapped routine; media is not independently form-reviewed.':'Some demonstrations are missing, so only a non-recording preview is available.'}</p></div><div class="dock-spacer"></div></main>`+nav();
}
function report(){const complete=history.filter(s=>s.completed),minutes=Math.floor(history.reduce((a,s)=>a+s.activeMs,0)/60000),mins=weekMinutes(),maxMin=Math.max(1,...mins),wk=week().length,goalPct=Math.round(wk/Math.max(1,prefs.frequency)*100);return header('REPORT',false,true)+`<main class="page"><div class="summary"><div class="stat"><b>${complete.length}</b><small>Completed</small></div><div class="stat"><b>${minutes}</b><small>Active minutes</small></div><div class="stat"><b>${wk}/${prefs.frequency}</b><small>This week · sessions</small></div><div class="stat"><b>${streak()}</b><small>Day streak</small></div></div><section class="goal-ring-card"><div class="goal-ring" style="--pct:${Math.min(100,goalPct)}%"><span>${wk}/${prefs.frequency}</span></div><div class="grow"><h2>Weekly goal</h2><p class="muted">${wk} of ${prefs.frequency} sessions this week (${goalPct}%). Change the target in Workout Settings.</p></div></section><h2>Weekly chart</h2><div class="week-chart">${mins.map((m,i)=>`<div class="bar"><i style="height:${Math.max(4,Math.round(m/maxMin*64))}px"></i><small>${'MTWTFSS'[i]}</small></div>`).join('')}</div><p class="muted">Mon — Sun · ${mins.reduce((a,b)=>a+b,0)} minutes this week. Only workouts you actually finish are counted — nothing is invented. Preview sessions never add progress.</p><h2>Workout history</h2>${history.length?history.slice().reverse().map(s=>`<div class="row"><div class="grow"><h3>${esc(programs.has(s.programId)?title(programs.get(s.programId)):s.programId)}</h3><small>${new Date(s.finishedAt).toLocaleString()} · ${s.completed?'Completed':'Partial — skipped steps'}</small></div></div>`).join(''):'<p>No recorded training sessions yet. Technical previews never add progress.</p>'}</main>`+nav()}
const MENU_ICONS={
 dumbbell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/></svg>',
 gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>',
 speaker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
 shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
 share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 10.5l7-4M8.5 13.5l7 4"/></svg>',
 chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z"/></svg>'
};
function menuRow(title,sub,id,icon){return btn(`<span class="menu-icon ${icon}">${MENU_ICONS[icon]}</span><span class="grow"><b>${title}</b><small>${sub}</small></span><span class="menu-chev">›</span>`,'settingsSub','menu-row',`data-id="${id}"`)}
function settings(){
 const acc=currentAccount();
 return header('SETTINGS',false,true)+`<main class="page settings-page"><section class="settings-card profile-card"><span class="profile-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></span><div class="grow">${acc?`<h2>${esc(acc.name)}</h2><p class="muted">${esc(acc.email)} · Your data stays on this device</p><span class="profile-pill">Account</span>`:`<h2>My profile</h2><p class="muted">Your data stays on this device</p><span class="profile-pill">Guest</span>`}</div></section><section class="settings-card menu-list">${menuRow('Workout Settings','Rest time, sessions per week, sounds','workout','dumbbell')}${menuRow('General Settings','Appearance: Light or Midnight','general','gear')}${menuRow('Voice Options','Spoken cues and volume','voice','speaker')}${menuRow('Backup & data',acc?`Signed in as ${esc(acc.name)}`:'Local only — no account connected','backup','shield')}</section><section class="settings-card menu-list">${acc?btn(`<span class="menu-icon gear">${MENU_ICONS.gear}</span><span class="grow"><b>Log out</b><small>Clears the session only — your data stays on this device</small></span><span class="menu-chev">›</span>`,'logout','menu-row')+btn(`<span class="menu-icon gear">${MENU_ICONS.gear}</span><span class="grow"><b>Switch account</b><small>Back to the welcome screen</small></span><span class="menu-chev">›</span>`,'switchAccount','menu-row')+btn(`<span class="menu-icon shield">${MENU_ICONS.shield}</span><span class="grow"><b>Delete account</b><small>Removes the account record only — history stays until Delete local data</small></span><span class="menu-chev">›</span>`,'deleteAccount','menu-row danger-row'):btn(`<span class="menu-icon shield">${MENU_ICONS.shield}</span><span class="grow"><b>Log in / Sign up</b><small>Accounts live only on this device</small></span><span class="menu-chev">›</span>`,'welcomeGate','menu-row')}${btn(`<span class="menu-icon share">${MENU_ICONS.share}</span><span class="grow"><b>Share Har Ghar Fitness</b><small>Send the app link to someone</small></span><span class="menu-chev">›</span>`,'share','menu-row')}<a class="menu-row" href="https://wa.me/919905166009" target="_blank" rel="noopener"><span class="menu-icon chat">${MENU_ICONS.chat}</span><span class="grow"><b>Feedback</b><small>WhatsApp support: +919905166009</small></span><span class="menu-chev">›</span></a>${btn(`<span class="menu-icon shield">${MENU_ICONS.shield}</span><span class="grow"><b>Terms &amp; Privacy</b><small>Terms of Service and Privacy Policy</small></span><span class="menu-chev">›</span>`,'openLegal','menu-row','data-doc="terms"')}</section><footer class="build-details"><b>App build v15</b><p>Service worker cache hgf-fitness-production-20261028-v15.</p><p>${data.summary.bundledExercises} source exercise records · ${data.summary.programs} programs · ${data.summary.days} days · ${data.summary.steps.toLocaleString()} ordered steps.</p><p>23 × 28-day programs (644 days) + 17 single-day programs (17 days) = 661 days · ${countFull} days fully mapped · ${countPreview} days preview-only.</p><p class="tiny-note">${countMedia} APK animations installed · ${countApproved} professional review attestations. Self-tracking works for fully mapped routines, with a safety notice before starting.</p></footer></main>`+nav();
}
function settingsWorkout(){
 const plannedList=plannedDayNames();const plannedIdx=plannedList.map(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(d));const plannedNames=plannedList.join(' · ');
 return header('Workout Settings',true)+`<main class="page settings-page"><section class="settings-card"><h2 class="section-head"><span class="section-icon" aria-hidden="true">${NAV_ICONS.training}</span>Workout preferences</h2><div class="stepper-row"><span>Default rest time</span><span class="stepper">${btn('−','stepRest','step-btn','data-delta="-1" aria-label="Decrease rest time"')}<b>${prefs.rest} seconds</b>${btn('+','stepRest','step-btn','data-delta="1" aria-label="Increase rest time"')}</span></div><div class="stepper-row"><span>Sessions each week</span><span class="stepper">${btn('−','stepFreq','step-btn','data-delta="-1" aria-label="Fewer sessions per week"')}<b>${prefs.frequency}</b>${btn('+','stepFreq','step-btn','data-delta="1" aria-label="More sessions per week"')}</span></div><div class="week">${['M','T','W','T','F','S','S'].map((x,i)=>`<span${plannedIdx.includes(i)?' class="planned"':''}>${x}</span>`).join('')}</div><p class="muted">${plannedNames} selected</p></section><section class="settings-card"><h2 class="section-head"><span class="section-icon" aria-hidden="true">${MENU_ICONS.speaker}</span>Workout sounds</h2><label class="toggle-row">Workout sounds <span class="switch"><input type="checkbox" data-pref="effects" ${prefs.effects?'checked':''} aria-label="Workout sounds"><i aria-hidden="true"></i></span></label><label class="field wide">Audio pack <select data-pref="soundPack" aria-label="Audio pack"><option value="reference" ${prefs.soundPack==='reference'?'selected':''}>Licensed APK sounds</option><option value="original" ${prefs.soundPack==='original'?'selected':''}>Original Har Ghar sounds</option></select></label><p class="muted">The APK provides tick, ding, whistle and cheer; these are mapped to countdown, ready, start, rest and completion.</p><div class="sound-preview-row">${['tick','ready','start','rest','finish'].map(name=>btn('♪ '+name,'sound','secondary',`data-id="${name}"`)).join('')}</div></section></main>`+nav();
}
function settingsGeneral(){
 return header('General Settings',true)+`<main class="page settings-page"><section class="settings-card"><h2 class="section-head"><span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>Appearance</h2><div class="theme-tiles">${btn(`<span class="theme-tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span><span>Light</span>${prefs.theme==='daylight'?'<span class="theme-check" aria-hidden="true">✓</span>':''}`,'theme',`theme-tile ${prefs.theme==='daylight'?'selected':''}`,'data-value="daylight"')}${btn(`<span class="theme-tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5z"/></svg></span><span>Midnight</span>${prefs.theme==='midnight'?'<span class="theme-check" aria-hidden="true">✓</span>':''}`,'theme',`theme-tile ${prefs.theme==='midnight'?'selected':''}`,'data-value="midnight"')}</div><p class="muted">Light matches the landing page. Midnight is a full dark theme — every screen stays readable in both.</p></section><section class="settings-card"><h2 class="section-head">Onboarding</h2>${currentAccount()?`<p class="muted">Review the new onboarding answers and change your goal, level, weekly plan or profile.</p>${btn('Review onboarding answers','newOnboardingReview','secondary')}`:`<p class="muted">Review the 6 onboarding steps and change your goal, level, comfort or weekly plan.</p>${btn('Review onboarding preferences','onboarding','secondary')}`}</section></main>`+nav();
}
function settingsVoice(){
 const volPct=Math.round(prefs.volume*100);
 return header('Voice Options',true)+`<main class="page settings-page"><section class="settings-card"><h2 class="section-head"><span class="section-icon" aria-hidden="true">${MENU_ICONS.speaker}</span>Voice &amp; spoken cues</h2><label class="toggle-row">Spoken cues <span class="switch"><input type="checkbox" data-pref="voice" ${prefs.voice?'checked':''} aria-label="Spoken cues"><i aria-hidden="true"></i></span></label><div class="volume-row"><span class="section-icon" aria-hidden="true">${MENU_ICONS.speaker}</span><input id="volumeRange" type="range" min="0" max="1" step=".05" value="${prefs.volume}" data-pref="volume" aria-label="Audio volume"><span id="volumePct">${volPct}%</span></div><p class="muted">Spoken cues use your device's speech service (English, India) where available. Turn spoken cues off to keep workouts silent.</p>${btn('Test voice','testVoice','secondary')}</section></main>`+nav();
}
function settingsBackup(){
 const acc=currentAccount();
 return header('Backup & data',true)+`<main class="page settings-page"><section class="settings-card"><h2 class="section-head"><span class="section-icon" aria-hidden="true">${MENU_ICONS.shield}</span>Privacy &amp; data</h2>${acc?`<p>Signed in as ${esc(acc.name)} (${esc(acc.email)}). Accounts and data live only on this device. No server, no sync. Export downloads a local file; nothing is uploaded anywhere.</p>`:`<p>Local only — no account connected. Your preferences and workout history stay in this browser. No accounts or analytics are connected. Export downloads a local file; nothing is uploaded anywhere.</p>`}${btn('Export my data','export','secondary full')}<div style="height:11px"></div>${btn('Delete local data','delete','danger full')}</section></main>`+nav();
}

function meal(){return header('MEAL',true)+`<main class="page"><p><span class="meal-pill">Meal</span></p><h2>Everyday balanced meals</h2><p>General information, not medical advice and not a diet plan.</p><section class="info-card"><h2>A balanced plate</h2><p>Choose a variety of familiar foods: grains, pulses or other protein foods, vegetables, fruit and water. Keep meals regular and enjoyable.</p><ul class="meal-list"><li>Grains: roti, rice, millets</li><li>Protein: dal, chana, rajma, egg, curd, paneer</li><li>Vegetables: seasonal sabzi, salad</li><li>Fruit: a piece with or after a meal</li><li>Water: through the day, especially after training</li></ul></section><section class="info-card"><h2>Indian thali — example</h2><p>Dal + seasonal sabzi + roti or rice + curd + salad + a piece of fruit. Adjust portions to your appetite and activity. No calorie target is set here, and no food is banned.</p></section><section class="info-card"><h2>Hydration</h2><p>Keep a water bottle nearby, especially after training. Drink when thirsty; do not force large amounts at once.</p></section><section class="info-card"><h2>Breakfast</h2><p>Poha / upma / paratha with curd, or egg + toast + fruit. Eat something within a couple of hours of waking if you train in the morning.</p></section><section class="info-card"><h2>Lunch</h2><p>Thali as above. Add salad for fibre and curd for protein.</p></section><section class="info-card"><h2>Dinner</h2><p>Lighter than lunch — dal + sabzi + roti, or khichdi + curd. Avoid a very heavy meal right before sleep.</p></section><div class="notice">What we do NOT do: no restrictive eating plans, no fasting plans, no weight-loss targets — especially not for underage users. If you have a health condition, talk to a doctor or a qualified dietitian. Consult a doctor before starting a new exercise or eating programme.</div><p>No calorie targets, weight-loss plan, or body measurements are required.</p></main>`+nav()}
const questions=[['Welcome to Har Ghar Fitness',null,[]],['What would you like to work on?','goal',['Build consistency','General fitness','Mobility']],['Choose your experience level','level',['Beginner','Intermediate','Advanced']],['Choose a comfort preference','comfort',['Standard','Avoid jumping','Prefer supported movements']],['Set your weekly goal','frequency',[1,2,3,4,5,6,7]],['Your initial schedule',null,[]]];
function onboarding(){const [heading,key,options]=questions[ob];const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];return `<main class="onboard"><div>${ob>0?btn('‹ Back','obBack','','aria-label="Previous question"'):'HAR GHAR FITNESS'}<small style="float:right">${ob+1} / 6</small></div><div class="ob-dots" aria-hidden="true">${[0,1,2,3,4,5].map(i=>`<i class="${i<=ob?'on':''}"></i>`).join('')}</div><h1>${heading}</h1>${ob===0?`<p>Little steps, lasting habits. Set your pace and explore motivating workouts — no measurements needed.</p>${coachMarkup('Jumping Jacks',{compact:true})}<div class="tiny-note">Illustrative coach motions only. Full training requires verified demonstrations.</div>`:''}<div class="choices">${options.map(o=>btn(`${o}${key==='frequency'?(o===1?' day per week':' days per week'):''}`,'answer',`choice ${prefs[key]==o?'selected':''}`,`data-key="${key}" data-value="${o}"`)).join('')}</div>${ob===5?`<p>${esc(prefs.goal)} · ${esc(prefs.level)} · ${esc(prefs.comfort)}</p><h2>${weeklyDays(prefs.frequency).join(' · ')}</h2><p>Original schedule based on your frequency. Experience selects the corresponding bundled plan; this personalization is not verified reference logic.</p>${prefs.comfort!=='Standard'?'<p>Your comfort preference is saved. Programs need a suitability review; an automatic safe replacement plan is not claimed.</p>':''}`:''}<div class="bottom">${btn(ob===5?'Open my plan':'Next','obNext','primary')}</div></main>`}
/* ============ Local-only accounts + new onboarding ============ */
// Auth screens never show the bottom nav and never gate existing users:
// render() only reaches them when authView is set (welcome gate, Settings
// account rows, or a sign-in/sign-up step). No third-party sign-in exists
// here: it would need a server, and this app has none.
function authLogo(){return `<div class="auth-logo"><span class="auth-logo-mark" aria-hidden="true">${LOGO_SVG}</span><span class="brand-title"><span>Har Ghar</span><span class="brand-green">Fitness</span></span></div><p class="auth-script">Fit Healthy Happy</p>`}
function authField(label,id,type,opts={}){
 const err=authForm.errors[opts.errorKey||id];
 const val=opts.keepValue===false?'':esc(authForm.values[id]||'');
 const icons={person:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.5"/>'};
 const loginIcon=opts.variant==='login';
 const chip=opts.icon?(loginIcon?`<span class="login-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#0F8A56" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[opts.icon]}</svg></span>`:`<span class="auth-icon-chip" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[opts.icon]}</svg></span>`):'';
 const meter=opts.meter?`<span class="pw-meter" id="pwMeter" aria-live="polite"><span class="pw-seg"></span><span class="pw-seg"></span><span class="pw-seg"></span><span class="pw-seg"></span><span class="pw-label"></span></span>`:'';
 return `<label class="auth-field"><span>${label}</span><span class="auth-input-wrap ${loginIcon?'login-wrap':(chip?'has-icon':'')}">${chip}<input id="${id}" type="${type}" ${type==='password'?'autocomplete="'+(opts.auto||'current-password')+'"':type==='email'?'autocomplete="email"':''} placeholder="${esc(opts.placeholder||'')}" value="${val}">${type==='password'?btn('Show','togglePw','auth-show',`data-target="${id}" aria-label="Show or hide password"`):''}</span>${err?`<span class="auth-error">${esc(err)}</span>`:''}${meter}</label>`;
}
function authWelcome(){
 return `<main class="onboard auth-page">${authLogo()}<h1>Welcome to Har Ghar Fitness</h1><p>Work out at home with guided programs, and track your progress on this device.</p><div class="bottom">${btn('Log In','authLogin','primary')}<div style="height:12px"></div>${btn('Sign Up','authSignup','secondary')}<div style="height:12px"></div>${btn('Continue as Guest','authGuest','secondary')}</div><p class="tiny-note">Accounts live only on this device. No server, no sync. Guest mode keeps the classic 6-step setup and never asks for an account.</p><p class="auth-switch">${btn('Terms of Service','openLegal','auth-link','data-doc="terms"')} · ${btn('Privacy Policy','openLegal','auth-link','data-doc="privacy"')}</p></main>`;
}
function authLogin(){
 return `<main class="onboard auth-page"><div>${btn('‹ Back','authBack','','aria-label="Back to welcome"')}</div>${authLogo()}<h1>Welcome Back</h1><p>Log in to continue your fitness journey.</p>${authForm.errors.form?`<p class="auth-error">${esc(authForm.errors.form)}</p>`:''}${authField('Email address','loginEmail','email',{errorKey:'email',placeholder:'Email address',icon:'mail',variant:'login'})}${authField('Password','loginPw','password',{errorKey:'password',placeholder:'Password',keepValue:false,icon:'lock',variant:'login'})}<div class="auth-row"><label class="auth-check"><input id="loginRemember" type="checkbox" ${authForm.values.remember?'checked':''}> Remember me</label>${btn('Forgot Password?','authForgot','auth-link')}</div><div class="bottom">${btn('Log In','submitLogin','primary login-solid')}<div class="or-divider"><span>OR</span></div>${btn('Continue as Guest','authGuest','secondary guest-outline')}<p class="auth-switch">Don&apos;t have an account? ${btn('Sign Up','authSignup','auth-link')}</p></div><p class="tiny-note">Accounts live only on this device. No server, no sync. With Remember me off, your session ends when this browser session ends.</p><p class="auth-switch">${btn('Terms of Service','openLegal','auth-link','data-doc="terms"')} · ${btn('Privacy Policy','openLegal','auth-link','data-doc="privacy"')}</p></main>`;
}
function authSignup(){
 return `<main class="onboard auth-page"><div>${btn('‹ Back','authBack','','aria-label="Back to welcome"')}</div>${authLogo()}<h1>Create Account</h1><p>Join Har Ghar Fitness and start your journey.</p>${authForm.errors.form?`<p class="auth-error">${esc(authForm.errors.form)}</p>`:''}${authField('Full name','signupName','text',{errorKey:'name',placeholder:'Full name',icon:'person'})}${authField('Email address','signupEmail','email',{errorKey:'email',placeholder:'Email address',icon:'mail'})}${authField('Password','signupPw','password',{errorKey:'password',placeholder:'Password',auto:'new-password',keepValue:false,icon:'lock',meter:true})}${authField('Confirm password','signupConfirm','password',{errorKey:'confirm',placeholder:'Confirm password',auto:'new-password',keepValue:false,icon:'lock'})}<div class="auth-terms"><label class="auth-check"><input id="signupTerms" type="checkbox" ${authForm.values.terms?'checked':''}> I agree to the</label><span class="legal-links">${btn('Terms','openLegal','auth-link','data-doc="terms"')}<span aria-hidden="true">&amp;</span>${btn('Privacy Policy','openLegal','auth-link','data-doc="privacy"')}</span></div>${authForm.errors.terms?`<p class="auth-error">${esc(authForm.errors.terms)}</p>`:''}<div class="bottom">${btn('Sign Up','submitSignup','primary')}<p class="auth-switch">Already have an account? ${btn('Log In','authLogin','auth-link')}</p></div><p class="tiny-note">Accounts live only on this device. No server, no sync. Your password is stored only as a salted hash on this device — never as plain text, and never sent anywhere.</p></main>`;
}
function authForgot(){
 return `<main class="onboard auth-page"><div>${btn('‹ Back','authBack','','aria-label="Back to welcome"')}</div>${authLogo()}<h1>Forgot Password?</h1><p>There is no password reset by email: this app has no server and sends no email, so no reset link can be sent.</p><p>These are the only real options on this device:</p><div class="bottom">${btn('Continue as Guest','authGuest','primary')}<div style="height:12px"></div>${btn('Create a new account','authSignup','secondary')}</div><p class="tiny-note">Guest mode keeps your existing on-device workouts and preferences. A new account starts fresh on this device; it does not recover the old account.</p></main>`;
}
const NB_FIGURE_MALE='<svg viewBox="0 0 120 180" aria-hidden="true"><circle cx="60" cy="22" r="14" fill="#122A3A"/><path d="M60 40 L48 58 M60 40 L72 58 M60 40 V92 M60 92 L46 140 M60 92 L74 140" fill="none" stroke="#122A3A" stroke-width="9" stroke-linecap="round"/></svg>';
const NB_FIGURE_FEMALE='<svg viewBox="0 0 120 180" aria-hidden="true"><circle cx="60" cy="22" r="14" fill="#122A3A"/><path d="M60 40 L46 62 M60 40 L74 62 M60 40 V96 M60 96 L48 142 M60 96 L72 142" fill="none" stroke="#122A3A" stroke-width="9" stroke-linecap="round"/><path d="M48 20 Q60 4 74 22" fill="none" stroke="#122A3A" stroke-width="6" stroke-linecap="round"/></svg>';
function nbBodyFigure(){
 const on=nb.answers.focus.includes.bind(nb.answers.focus);
 const dot=f=>`<circle cx="${f==='arm'?'38':f==='chest'?'60':f==='abs'?'60':'76'}" cy="${f==='arm'?'70':f==='chest'?'52':f==='abs'?'84':'118'}" r="7" fill="${on(f)?'#0F8A56':'#CBD5D1'}"/>`;
 return `<svg class="nb-body" viewBox="0 0 120 180" aria-hidden="true"><circle cx="60" cy="22" r="14" fill="#122A3A"/><path d="M60 40 L48 58 M60 40 L72 58 M60 40 V92 M60 92 L46 140 M60 92 L74 140" fill="none" stroke="#122A3A" stroke-width="9" stroke-linecap="round"/>${['arm','chest','abs','leg'].map(dot).join('')}</svg>`;
}
function nbChoiceBtn(label,field,value,selected){
 return btn(label,'nbChoice',`nb-choice ${selected?'selected':''}`,`data-field="${field}" data-value="${esc(value)}"`);
}
function nbToggleBtn(label,field,value,selected){
 return btn(`${selected?'✓ ':''}${label}`,'nbToggle',`nb-chip ${selected?'selected':''}`,`data-field="${field}" data-value="${esc(value)}"`);
}
function nbStepBody(step){
 const a=nb.answers;
 if(step==='gender')return `<h1>What&apos;s your gender?</h1><p>Let us know you better.</p><div class="nb-figures">${btn(`${NB_FIGURE_MALE}<b>Male</b>`,'nbChoice',`nb-figure ${a.gender==='Male'?'selected':''}`,`data-field="gender" data-value="Male"`)}${btn(`${NB_FIGURE_FEMALE}<b>Female</b>`,'nbChoice',`nb-figure ${a.gender==='Female'?'selected':''}`,`data-field="gender" data-value="Female"`)}</div>`;
 if(step==='focus')return `<h1>Please choose your focus area</h1><p>Pick one or more. Full Body picks the 28-day full-body plan.</p><div class="nb-focus-wrap"><div class="nb-focus-chips">${[['full','Full Body'],['arm','Arm'],['chest','Chest'],['abs','Abs'],['leg','Leg']].map(([v,n])=>nbToggleBtn(n,'focus',v,a.focus.includes(v))).join('')}</div>${nbBodyFigure()}</div>`;
 if(step==='goals')return `<h1>What are your main goals?</h1><div class="choices">${[['Lose Weight','Burn calories &amp; lose fat'],['Build Muscle','Gain strength &amp; tone muscles'],['Keep Fit','Stay active &amp; healthy daily']].map(([v,sub])=>btn(`<b>${v}</b><small>${sub}</small>`,'nbChoice',`nb-choice ${a.goals===v?'selected':''}`,`data-field="goals" data-value="${v}"`)).join('')}</div>`;
 if(step==='motivation')return `<h1>What keeps you going?</h1><div class="choices">${['Stay consistent','Feel more energetic','Look better','Improve health'].map(v=>nbChoiceBtn(v,'motivation',v,a.motivation===v)).join('')}</div>`;
 if(step==='pushups')return `<h1>How many push-ups can you do?</h1><p>This only sets a starting level — Beginner or Intermediate, never Advanced from a questionnaire alone.</p><div class="choices">${[['0','I can&apos;t do one yet'],['1-10','1–10 push-ups'],['10+','10+ push-ups']].map(([v,n])=>nbChoiceBtn(n,'pushups',v,a.pushups===v)).join('')}</div>`;
 if(step==='discomfort')return `<h1>Any discomfort or concerns?</h1><p>Saved as a note only. It does not change the plan into a medically safe plan — adjust or skip any exercise that feels unsuitable.</p><div class="nb-chips">${['None','Knee','Back','Shoulder','Wrist'].map(v=>nbToggleBtn(v,'discomfort',v,a.discomfort.includes(v))).join('')}</div>`;
 if(step==='activity')return `<h1>How active are you?</h1><div class="choices">${['Not very active','Moderately active','Very active'].map(v=>nbChoiceBtn(v,'activity',v,a.activity===v)).join('')}</div>`;
 if(step==='weekly')return `<h1>Set your weekly goal</h1><p>How many sessions per week? This is the same weekly goal shown on Training.</p><div class="stepper-row"><span>Sessions each week</span><span class="stepper">${btn('−','nbFreq','step-btn','data-delta="-1" aria-label="Fewer sessions per week"')}<b>${a.frequency}</b>${btn('+','nbFreq','step-btn','data-delta="1" aria-label="More sessions per week"')}</span></div><p class="muted">Planned days: ${weeklyDays(a.frequency).join(' · ')}</p>`;
 if(step==='measurements')return `<h1>Weight &amp; height</h1><p>Optional. Stored only in your on-device profile, never sent anywhere.</p><label class="auth-field"><span>Weight (kg)</span><input id="nbWeight" type="number" inputmode="decimal" min="20" max="400" value="${esc(a.weightKg)}" placeholder="e.g. 70" ${a.preferNotToSay?'disabled':''} aria-label="Weight in kilograms"></label><label class="auth-field"><span>Height (cm)</span><input id="nbHeight" type="number" inputmode="decimal" min="80" max="250" value="${esc(a.heightCm)}" placeholder="e.g. 170" ${a.preferNotToSay?'disabled':''} aria-label="Height in centimetres"></label><div class="auth-row"><label class="auth-check"><input id="nbPrefer" type="checkbox" ${a.preferNotToSay?'checked':''}> Prefer not to say</label></div>${nb.error?`<p class="auth-error">${esc(nb.error)}</p>`:''}`;
 if(step==='generating'){
  if(dataReady&&!nb.genTimer){nb.genTimer=setTimeout(()=>{if(!nb||NB_STEPS[nb.step]!=='generating')return;nb.match=matchPlan({focus:nb.answers.focus,pushups:nb.answers.pushups,programIds:[...programs.keys()]});nb.step=NB_STEPS.indexOf('plan');nb.genTimer=null;render()},1400)}
  return `<h1>Creating your plan…</h1><div class="nb-generating"><p>Matching your answers to the bundled programs…</p><p>Checking which days are fully mapped…</p><p>Saving your plan on this device…</p></div>${!dataReady?'<p class="muted">Programs are still loading — this continues automatically when they arrive.</p>':''}`;
 }
 // plan-ready
 const m=nb.match||matchPlan({focus:a.focus,pushups:a.pushups,programIds:dataReady?[...programs.keys()]:[]});
 const p=dataReady?programs.get(m.programId):null;
 const previewOnly=dataReady&&p?(!canTrain(stepsFor(p.id,0))):false;
 const discomfort=a.discomfort.filter(d=>d!=='None');
 return `<h1>Your plan is ready!</h1><p>We have selected this plan that suits you best.</p><section class="nb-plan-card"><div class="nb-plan-copy"><small>${p?`${p.days.length} DAYS`:''}</small><h2>${p?esc(title(p)):'28-Day Full Body · Beginner'}</h2><p>Level: ${m.levelName}${previewOnly?' · Day 1 is preview-only':''}</p>${discomfort.length?`<p class="nb-note">You noted: ${esc(discomfort.join(', '))}. This is not a medical recommendation — adjust or skip any exercise that feels unsuitable.</p>`:''}</div><svg class="nb-plan-figure" viewBox="0 0 100 140" aria-hidden="true"><circle cx="50" cy="16" r="11" fill="#fff"/><path d="M50 30 L40 56 M50 30 L64 48 M50 30 L46 66 M46 66 L30 96 M46 66 L62 92" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg></section>${previewOnly?'<p class="muted">Day 1 is preview-only, so START NOW opens it in preview mode and will not record history.</p>':''}<div class="bottom">${dataReady?btn('START NOW','nbPlanStart','primary'):''}${nb.editing?btn('Save changes','nbPlanSave','secondary'):''}${btn('Go to homepage','nbPlanHome','secondary')}</div>`;
}
function nbScreen(){
 const step=NB_STEPS[nb.step]||'gender';
 const pct=Math.round(((nb.step+1)/NB_STEPS.length)*100);
 return `<main class="onboard auth-page"><div>${btn('‹ Back','nbBack','','aria-label="Previous step"')}<small style="float:right">${nb.step+1} / ${NB_STEPS.length}</small></div><div class="nb-progress" role="progressbar" aria-label="Onboarding progress" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>${step!=='plan'&&step!=='generating'?`<div style="text-align:right">${btn('Skip','nbSkip','auth-link')}</div>`:''}${nbStepBody(step)}${step!=='plan'&&step!=='generating'?`<div class="bottom">${btn('NEXT','nbNext','primary')}</div>`:''}</main>`;
}
function profileToAnswers(pr){
 if(!pr)return defaultNbAnswers();
 return {gender:pr.gender||null,focus:pr.focus?.length?pr.focus:['full'],goals:pr.goals||'Keep Fit',motivation:pr.motivation||null,pushups:pr.pushups||'0',discomfort:pr.discomfort||[],activity:pr.activity||null,frequency:prefs.frequency,weightKg:pr.weightKg!=null?String(pr.weightKg):'',heightCm:pr.heightCm!=null?String(pr.heightCm):'',preferNotToSay:!!pr.preferNotToSay};
}
function saveNb(){
 const m=nb.match||matchPlan({focus:nb.answers.focus,pushups:nb.answers.pushups,programIds:[...programs.keys()]});
 const a=nb.answers;
 prefs.goal=a.goals;prefs.level=m.levelName;prefs.plannedDays=adjustPlannedDays(plannedDayNames(),a.frequency);prefs.frequency=a.frequency;
 if(a.discomfort.length&&!a.discomfort.includes('None'))prefs.comfort='Prefer supported movements';
 profile={name:currentAccount()?.name||profile?.name||'',gender:a.gender,focus:a.focus,goals:a.goals,motivation:a.motivation,pushups:a.pushups,discomfort:a.discomfort,activity:a.activity,weightKg:a.preferNotToSay?null:(a.weightKg===''||a.weightKg==null?null:Number(a.weightKg)),heightCm:a.preferNotToSay?null:(a.heightCm===''||a.heightCm==null?null:Number(a.heightCm)),preferNotToSay:!!a.preferNotToSay};
 onboarded=true;nb=null;
 const acc=currentAccount();if(acc){acc.onboarded=true;acc.profile=profile;saveAccounts()}
 persist();
 return m;
}
function authScreen(){switch(authView){case 'login':return authLogin();case 'signup':return authSignup();case 'forgot':return authForgot();case 'newOnboarding':return nbScreen();case 'legal-terms':return legalScreen('terms');case 'legal-privacy':return legalScreen('privacy');default:return authWelcome()}}
function loadingScreen(){return `<main class="page loading-screen"><h2>Loading workout programs…</h2><p id="loadMsg" role="status">Loading workout programs…</p><div class="loading-bar" aria-hidden="true"><span></span></div><p class="muted">163 animations · 40 programs · 661 days. The full program library downloads once, then it is cached for offline use.</p></main>`}
function player(){
 if(!engine.session){route={name:'training'};return training()}
 const s=engine.session,phase=engine.state,target=engine.step,rest=phase==='REST',paused=['PAUSED','INTERRUPTED','EXIT_CONFIRMATION'].includes(phase),ended=phase==='COMPLETED';
 const indicator=ended?'FINISHED':rest?'RECOVER & RESET':phase==='READY'?'GET READY':paused?'ON HOLD':'KEEP MOVING';
 let panel='';
 if(ended){panel=`${uiAnimation('popper','completion-confetti')}<div class="completion-graphic" aria-hidden="true">✦</div><div class="phase-pill">PREVIEW COMPLETE</div><h2>${s.preview?'Preview complete':s.completed?'Workout completed':'Session finished'}</h2><p>${s.preview?'The timer and controls were demonstrated. No workout progress or history was recorded.':`${Object.values(s.results).filter(x=>x==='done').length} of ${s.steps.length} steps completed.`}</p>${btn('Back to Training','finish','primary')}`}
 else {
  const ratio=engine.left===null?1:Math.max(0,Math.min(1,engine.remaining/(engine.phaseTotal||1)));
  const ring=engine.left!==null?`<div class="timer-ring" id="ring" style="--ratio:${ratio}"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="46"/><circle class="timer-arc" cx="55" cy="55" r="46"/></svg><span id="timer" role="timer">${timerText()}</span></div>`:'';
  panel=`<div class="phase-pill">${indicator}</div>${rest?`<h3>Next: ${esc(displayName(ex(target.exerciseId)))}</h3>`:`<h3>${esc(displayName(ex(target.exerciseId)))}</h3>`}${!rest&&target.mode==='reps'?`<p class="reps-label">REPS × ${target.value}</p>`:''}${paused?`<p class="paused-label">${phase==='INTERRUPTED'?'Your session was interrupted. Your time is preserved.':'Timer paused — restart when you are ready.'}</p>`:''}${ring}${rest?`<div class="rest-actions"><p id="restCaption" style="color:#cfe6f2;font-size:13px;margin:0 0 10px">Rest ${Math.ceil((engine.phaseTotal||0)/1000)}s total · ${Math.ceil(engine.remaining/1000)}s left · set by the imported routine (10s or 25s per step; 25s when the source sets none).</p><div class="rest-edit"><label for="restEdit">Rest time</label><input id="restEdit" type="number" min="1" max="600" value="${Math.ceil((engine.phaseTotal||engine.remaining||0)/1000)}" aria-label="Rest seconds"><span>s</span>${btn('Apply','applyRest','secondary')}</div><div class="actions">${btn('⏮ Previous','previous','secondary')}${btn('+20 seconds','addRest','secondary')}${btn('Skip rest  →','skipRest','primary')}</div></div>`:phase==='READY'?btn('Start now  →','skipReady','primary'):paused?`<div class="transport">${btn('<span class="t-ic">←</span><span>Previous</span>','previous','tbtn',`aria-label="Previous exercise" ${s.index===0?'disabled':''}`)}${btn('Resume  ▶','resume','primary')}${btn('<span class="t-ic">→</span><span>Next</span>','next','tbtn','aria-label="Next exercise"')}${btn('<span class="t-ic">≫</span><span>Skip</span>','next','tbtn','aria-label="Skip exercise"')}</div>`:`<div class="transport">${target.mode==='reps'?'':btn('<span class="t-ic">⏸</span><span>Pause</span>','pause','tbtn','aria-label="Pause timer"')}${btn('<span class="t-ic">←</span><span>Previous</span>','previous','tbtn',`aria-label="Previous exercise" ${s.index===0?'disabled':''}`)}${btn('<span class="t-ic">→</span><span>Next</span>','next','tbtn','aria-label="Next exercise"')}${btn('<span class="t-ic">≫</span><span>Skip</span>','next','tbtn','aria-label="Skip exercise"')}</div>${target.mode==='reps'?`<div style="margin-top:15px;width:100%">${isMissingExercise(ex(target.exerciseId))?btn('Skip — no demonstration available','next','secondary'):btn(`✓ Done · ${target.value} repetitions`,'done','primary')}</div><p class="muted" style="margin-top:12px">🕐 Rest ${restAfter(target)}s total after this step</p>`:target.mode==='timed'?`<p class="muted" style="margin-top:12px">🕐 Rest ${restAfter(target)}s total after this step</p>`:''}`}`;
 }
 return `<main class="player ${rest?'rest':''}"><div class="preview-tag">${s.preview?'PREVIEW MODE · WORKOUT HISTORY IS NOT RECORDED':'TRAINING SESSION'}</div>${sessionLabel?`<div class="player-session-name">${esc(sessionLabel)}</div>`:''}<div class="player-top"><small>${ended?'✓':rest?`UP NEXT · ${s.index+1} OF ${s.steps.length}`:`${s.index+1} OF ${s.steps.length}`}</small><div class="progress player-progress"><div style="width:${ended?100:s.index/s.steps.length*100}%"></div></div><div class="player-toggles">${btn(effectsOn()?'♫':'♪̸','toggleEffects','','aria-label="Toggle effects"')}${btn(voiceOn()?'🔊':'🔇','mute','','aria-label="Toggle voice"')}</div>${btn('×','exit','exit-btn','aria-label="Exit workout"')}</div>${ended?'':`<div class="demo">${emptyMedia(target.exerciseId)}</div>`}<section class="panel ${ended?'completion-panel':''}">${panel}</section></main>${phase==='EXIT_CONFIRMATION'?`<div class="overlay"><section class="dialog" role="dialog" aria-modal="true"><h2>Leave your session?</h2><p>Any unfinished activity won't count as a completed workout.</p>${btn('Continue preview','cancelExit','primary')}${btn('Leave session','confirmExit','danger')}</section></div>`:''}`;
}

function timerText(){if(engine.left===null)return `× ${engine.step?.value||0}`;let sec=Math.ceil(engine.remaining/1000);return engine.state==='READY'?sec:`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function render(){document.documentElement.dataset.theme=prefs.theme==='midnight'?'midnight':'daylight';root.style.paddingBottom=route.name==='player'||!onboarded||authView?'0':'';const pages={training,discover,detail,exercise,plans,editor,collection,catalog,report,settings,meal,player,challenges,'settings-workout':settingsWorkout,'settings-general':settingsGeneral,'settings-voice':settingsVoice,'settings-backup':settingsBackup};root.innerHTML=(authView?authScreen():(!dataReady?(!onboarded?onboarding():loadingScreen()):(!onboarded?onboarding():(pages[route.name]||training)())))+(notice?`<div class="notice" role="status">${esc(notice)}</div>`:'')+(modal?.type==='picker'?picker():modal?.type==='start'?`<div class="overlay"><section class="dialog" role="dialog" aria-modal="true"><h2>Training is not ready</h2><p>The licensed exercise animations and source instructions are installed. Some exercises in this routine still lack a documented technique and safety review. You can test the complete player without recording workout history.</p>${btn('Open technical preview','preview','primary')}<br>${btn('Back','closeModal','secondary')}</section></div>`:modal?.type==='sourceCaution'?`<div class="overlay"><section class="dialog" role="dialog" aria-modal="true"><h2>Before you begin</h2><p>This routine has original licensed animation and written guidance for every step, but its technique has not been independently reviewed. Work at a comfortable pace, adjust or skip any exercise that feels unsuitable, and stop if you feel pain or dizziness.</p>${btn('Start and save my session','beginTraining','primary')}${btn('Explore without saving','preview','secondary')}${btn('Cancel','closeModal','secondary')}</section></div>`:modal?.type==='delete'?`<div class="overlay"><section class="dialog" role="dialog" aria-modal="true"><h2>Delete local data?</h2><p>This removes saved preferences, edits and history.</p>${btn('Delete','confirmDelete','danger')}<br>${btn('Cancel','closeModal','secondary')}</section></div>`:modal?.type==='deleteAccount'?`<div class="overlay"><section class="dialog" role="dialog" aria-modal="true"><h2>Delete account?</h2><p>This deletes your local account record and signs you out, returning to the welcome screen.</p><p>Your on-device workout history and preferences are NOT deleted by this — they are removed only by “Delete local data” in Backup &amp; data.</p>${btn('Delete account','confirmDeleteAccount','danger')}<br>${btn('Cancel','closeModal','secondary')}</section></div>`:'');if(route.name==='training'&&trainingQuery)applyTrainingSearch();if(modal)root.querySelector('.dialog button,.dialog input')?.focus();loadAnimations()}
function start(preview){modal=null;sessionVoice=prefs.voice;sessionEffects=prefs.effects;warmSounds(prefs.soundPack);route={name:'player'};window.scrollTo(0,0);try{engine.start({steps:active.steps,programId:active.p.id,dayId:String(active.day+1),preview,reviewed:reviewed(active.steps),contentReady:canTrain(active.steps),restSeconds:prefs.rest});render()}catch(e){notice=e.message;route={name:'detail',id:active.p.id,day:active.day};render()}}
root.addEventListener('click',async ev=>{const b=ev.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action,id=b.dataset.id,i=+b.dataset.index;notice='';
 const engineActions=['pause','resume','previous','next','done','skipRest','skipReady','addRest','cancelExit','confirmExit'];if(engineActions.includes(a)){if((a==='previous'||a==='next')&&['PAUSED','INTERRUPTED'].includes(engine.state))engine.resume();engine[a]();if(a==='confirmExit'){sessionVoice=null;sessionEffects=null;sessionLabel=null;persist();route={name:'training'};render()}return}
 if(a==='sound'){warmSounds(prefs.soundPack);playSound(id,{...prefs,effects:true});return}if(a==='theme'){prefs.theme=b.dataset.value==='midnight'?'midnight':'daylight';prefs.themeChosen=true;persist();render();return}if(a==='toggleEffects'){if(engine.session&&route.name==='player'){sessionEffects=!effectsOn();if(!effectsOn())stopSounds();render();return}prefs.effects=!prefs.effects;if(!prefs.effects)stopSounds();persist();render();return}
 if(a==='back')return back();if(a==='nav'){capture();stack=[];route={name:b.dataset.name};modal=null;render();window.scrollTo(0,0);return}
 if(a==='body'){body=id;render();return}if(a==='program'){recentlyViewed=[id,...recentlyViewed.filter(x=>x!==id)].slice(0,8);persist();return go({name:'detail',id,day:lastDayByProgram[id]||0});}if(a==='plans')return go({name:'plans'});
 if(a==='day')return go({name:'detail',id:active.p.id,day:+b.dataset.day});
 if(a==='exercise'){tab='Animation';return go({name:'exercise',index:i})}if(a==='pageExercise'){route.index+=+b.dataset.delta;render();window.scrollTo(0,0);return}if(a==='tab'){tab=b.dataset.tab;render();return}
 if(a==='catalog')return go({name:+b.dataset.type===4?'collection':'catalog',id});if(a==='collection')return go({name:'collection',id});
 if(a==='discoverFilter'){discoverFilter=id;applyDiscoverFilter();return}
 if(a==='stepRest'){prefs.rest=Math.min(600,Math.max(1,prefs.rest+(+b.dataset.delta)*5));persist();render();return}
 if(a==='stepFreq'){const nf=Math.min(7,Math.max(1,prefs.frequency+(+b.dataset.delta)));prefs.plannedDays=adjustPlannedDays(plannedDayNames(),nf);prefs.frequency=nf;persist();render();return}
 if(a==='startCatalog'){const w=data.catalog.find(x=>x.id===id);if(!w)return;const r=discoverRoutineFor(w,[...programs.keys()]);const p=programs.get(r.programId);if(!p)return;active={p,steps:stepsFor(p.id,0),day:0};active.discoverName=discoverDisplayTitle(w);sessionLabel=active.discoverName;persist();if(reviewed(active.steps))return start(false);modal={type:canTrain(active.steps)?'sourceCaution':'start'};render();return}
 if(a==='edit'){draft=structuredClone(active.steps);return go({name:'editor'})}
 if(a==='custom'){const p={id:'custom-'+Date.now(),title:'Custom Workout',days:[{id:'1',steps:[]}]};active={p,steps:[],day:0};draft=[];newCustomId=p.id;return go({name:'editor'})}
 if(a==='add'||a==='replace'){modal={type:'picker',index:a==='replace'?i:null};render();return}
 if(a==='pick'){const e=ex(id),s={exerciseId:id,position:0,value:e.unit==='s'?30:10,unit:e.unit,mode:e.unit==='s'?'timed':'reps',restSeconds:null,edited:true};if(modal.index==null)draft.push(s);else draft[modal.index]=s;modal=null;render();return}
 if(a==='remove'){draft.splice(i,1);render();return}if(a==='move'){const j=i+(+b.dataset.delta);[draft[i],draft[j]]=[draft[j],draft[i]];render();return}
 if(a==='defaults'){draft=structuredClone(active.p.days[active.day].steps);render();return}
 if(a==='saveEdit'){if(newCustomId&&newCustomId===active.p.id){programs.set(active.p.id,active.p);custom.push(active.p)}edits[`${active.p.id}:${active.day}`]=draft.map((s,i)=>({...s,position:i}));newCustomId=null;persist();route={name:'detail',id:active.p.id,day:active.day};render();return}
 if(a==='deleteCustom'){const id=active.p.id;const _ci=custom.findIndex(p=>p.id===id);if(_ci>=0)custom.splice(_ci,1);programs.delete(id);for(const k of Object.keys(edits))if(k.startsWith(id+':'))delete edits[k];newCustomId=null;persist();stack=[];route={name:'training'};render();return}
 if(a==='cancelEdit'){if(newCustomId&&newCustomId===active.p.id){newCustomId=null;persist();stack=[];route={name:'training'};render();return}return back()}
 if(a==='start'){sessionLabel=active.discoverName||title(active.p);persist();if(reviewed(active.steps))return start(false);modal={type:canTrain(active.steps)?'sourceCaution':'start'};render();return}if(a==='beginTraining')return start(false);if(a==='preview')return start(true);if(a==='exit')return engine.requestExit();if(a==='finish'){checkpoint=null;engine.session=null;engine.state='IDLE';sessionVoice=null;sessionEffects=null;sessionLabel=null;persist();stack=[];route={name:'training'};render();return}
 if(a==='applyRest'){const inp=document.querySelector('#restEdit');const v=inp?+inp.value:NaN;if(Number.isFinite(v)&&v>=1&&v<=600){engine.editRest(v);render()}else{notice='Enter a rest time from 1 to 600 seconds.';render()}return}
 if(a==='mute'){if(engine.session&&route.name==='player'){sessionVoice=!voiceOn();silence();render();return}prefs.voice=!prefs.voice;silence();persist();render();return}if(a==='closeModal'){modal=null;render();return}
 if(a==='onboarding'){ob=0;onboarded=false;persist();render();return}if(a==='answer'){prefs[b.dataset.key]=b.dataset.key==='frequency'?+b.dataset.value:b.dataset.value;persist();render();return}
 // ---- Local-only accounts + new onboarding ----
 if(a==='welcomeGate'){authView='welcome';authForm={values:{},errors:{}};render();return}
 if(a==='authLogin'){authView='login';authForm={values:{},errors:{}};render();return}
 if(a==='authSignup'){authView='signup';authForm={values:{},errors:{}};render();return}
 if(a==='authForgot'){authView='forgot';render();return}
 if(a==='authBack'){authView='welcome';authForm={values:{},errors:{}};render();return}
 if(a==='openLegal'){captureAuthForm();legalFrom=(authView&&authView.startsWith('legal-'))?legalFrom:(authView||'settings');authView='legal-'+(b.dataset.doc==='privacy'?'privacy':'terms');render();return}
 if(a==='legalBack'){authView=legalFrom==='settings'?null:(legalFrom||'welcome');legalFrom=null;render();return}
 if(a==='authGuest'){authView=null;render();return}
 if(a==='togglePw'){const inp=document.querySelector('#'+b.dataset.target);if(inp)inp.type=inp.type==='password'?'text':'password';return}
 if(a==='logout'||a==='switchAccount'){clearSession();authView='welcome';authForm={values:{},errors:{}};render();return}
 if(a==='newOnboardingReview'){nb={step:0,answers:profileToAnswers(profile),editing:true};authView='newOnboarding';render();return}
 if(a==='submitLogin'){
  const emailEl=document.querySelector('#loginEmail'),pwEl=document.querySelector('#loginPw');
  const email=normalizeEmail(emailEl?.value||''),pw=pwEl?.value||'';
  authForm={values:{loginEmail:email,remember:!!document.querySelector('#loginRemember')?.checked},errors:{}};
  if(!email||!pw){authForm.errors.form='Enter your email and password.';authView='login';render();return}
  const acc=accounts.find(x=>x.email===email);
  if(!acc){authForm.errors.form='Email or password is incorrect.';authView='login';render();return}
  if(!window.crypto?.subtle){authForm.errors.form='Secure sign-in is unavailable in this browser. Your password was not checked or saved.';authView='login';render();return}
  const hash=await hashPassword(pw,acc.salt);
  if(hash!==acc.hash){authForm.errors.form='Email or password is incorrect.';authView='login';render();return}
  saveSession(acc.email,authForm.values.remember);
  if(acc.onboarded){authView=null;stack=[];route={name:'training'};render();return}
  nb={step:0,answers:profileToAnswers(acc.profile),editing:false};authView='newOnboarding';persist();render();return;
 }
 if(a==='submitSignup'){
  const name=document.querySelector('#signupName')?.value||'',email=document.querySelector('#signupEmail')?.value||'';
  const pw=document.querySelector('#signupPw')?.value||'',confirm=document.querySelector('#signupConfirm')?.value||'';
  const terms=!!document.querySelector('#signupTerms')?.checked;
  const errors=validateSignup({name,email,password:pw,confirm,terms});
  authForm={values:{signupName:name,signupEmail:email,terms},errors};
  if(Object.keys(errors).length){authView='signup';render();return}
  const norm=normalizeEmail(email);
  if(accounts.some(x=>x.email===norm)){authForm.errors={form:'An account with this email already exists on this device. Log in instead, or continue as a guest.'};authView='signup';render();return}
  if(!window.crypto?.subtle){authForm.errors={form:'Secure sign-up is unavailable in this browser (Web Crypto is not available). Your password was not saved.'};authView='signup';render();return}
  const salt=randomSaltHex(),hash=await hashPassword(pw,salt);
  const acc=createAccountRecord({name,email:norm,salt,hash});
  accounts.push(acc);saveAccounts();saveSession(acc.email,true);
  nb={step:0,answers:defaultNbAnswers(),editing:false};authView='newOnboarding';persist();render();return;
 }
 if(a==='nbBack'){if(!nb)return;if(nb.step>0){nb.step--;if(nb.genTimer){clearTimeout(nb.genTimer);nb.genTimer=null}persist();render();return}if(nb.editing){nb=null;authView=null;route={name:'settings-general'};render();return}nb=null;authView='welcome';render();return}
 if(a==='nbSkip'){if(!nb)return;nb.answers=defaultNbAnswers();nb.step=NB_STEPS.indexOf('generating');persist();render();return}
 if(a==='nbChoice'){if(!nb)return;nb.answers[b.dataset.field]=b.dataset.value;render();return}
 if(a==='nbToggle'){
  if(!nb)return;const f=b.dataset.field,v=b.dataset.value,arr=nb.answers[f];
  if(f==='discomfort'){if(v==='None')nb.answers.discomfort=['None'];else nb.answers.discomfort=arr.filter(x=>x!=='None'&&x!==v).concat(arr.includes(v)?[]:[v]);}
  else if(f==='focus'){if(v==='full')nb.answers.focus=['full'];else nb.answers.focus=arr.filter(x=>x!=='full'&&x!==v).concat(arr.includes(v)?[]:[v]);if(!nb.answers.focus.length)nb.answers.focus=['full'];}
  render();return;
 }
 if(a==='nbFreq'){if(!nb)return;nb.answers.frequency=Math.min(7,Math.max(1,nb.answers.frequency+(+b.dataset.delta)));render();return}
 if(a==='nbNext'){
  if(!nb)return;const step=NB_STEPS[nb.step];
  if(step==='measurements'){
   const w=nb.answers.weightKg,h=nb.answers.heightCm;
   if(!nb.answers.preferNotToSay){
    if(w!==''&&!(+w>=20&&+w<=400)){nb.error='Weight must be between 20 and 400 kg, or tick “Prefer not to say”.';render();return}
    if(h!==''&&!(+h>=80&&+h<=250)){nb.error='Height must be between 80 and 250 cm, or tick “Prefer not to say”.';render();return}
   }
   nb.error=null;
  }
  nb.step=Math.min(NB_STEPS.indexOf('plan'),nb.step+1);persist();render();return;
 }
 if(a==='nbPlanStart'){if(!nb)return;const m=saveNb();authView=null;return go({name:'detail',id:m.programId,day:0})}
 if(a==='nbPlanHome'){if(!nb)return;saveNb();authView=null;stack=[];route={name:'training'};render();return}
 if(a==='nbPlanSave'){if(!nb)return;saveNb();authView=null;route={name:'settings-general'};render();return}
 if(a==='obBack'){ob=Math.max(0,ob-1);persist();render();return}if(a==='obNext'){if(ob<5)ob++;else{onboarded=true;const acc=currentAccount();if(acc){acc.onboarded=true;saveAccounts()}if(!applyDeepLink()){const plan='7__4_'+({Beginner:'beginner',Intermediate:'intermediate',Advanced:'advance'})[prefs.level];route={name:'detail',id:plan,day:0}}}persist();render();return}
 if(a==='editGoal')return go({name:'settings-workout'});
 if(a==='challengeDay1'){recentlyViewed=[id,...recentlyViewed.filter(x=>x!==id)].slice(0,8);persist();return go({name:'detail',id,day:0});}
 if(a==='challenges')return go({name:'challenges'});
 if(a==='challengeFilter'){challengeFilter=id;render();return}
 if(a==='quickChip'){trainingQuick=trainingQuick===id?null:id;render();return}
 if(a==='settingsSub')return go({name:'settings-'+id});
 if(a==='discoverModule'){discoverFilter=id;capture();stack=[];route={name:'discover'};render();applyDiscoverFilter();return}
 if(a==='focusSearch'){document.querySelector('#discoverSearch')?.focus();return}
 if(a==='testVoice'){if('speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance('This is Har Ghar Fitness.');u.lang='en-IN';u.volume=prefs.volume;window.speechSynthesis.speak(u);notice='Voice test played.';render()}else{notice='Spoken cues are not supported in this browser.';render()}return}
 if(a==='share'){if(navigator.share){navigator.share({title:'Har Ghar Fitness',text:'Home workouts, guided programs and progress tracking.',url:location.href}).catch(()=>{});return}notice='Sharing is not supported in this browser. Copy this link: '+location.href;render();return}
 if(a==='exerciseSearch'){const loc=findExerciseLocation(id);if(!loc)return;active={p:loc.p,steps:stepsFor(loc.p.id,loc.day),day:loc.day};tab='Animation';return go({name:'exercise',index:loc.index})}
 if(a==='export'){try{const blob=new Blob([JSON.stringify({version:1,prefs,history,edits,custom},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='har-ghar-fitness-data.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}catch{notice='Export is not supported in this browser.';render()}return}
 if(a==='delete'){modal={type:'delete'};render();return}if(a==='confirmDelete'){localStorage.removeItem(KEY);location.reload();return}
 if(a==='deleteAccount'){modal={type:'deleteAccount'};render();return}
 if(a==='confirmDeleteAccount'){const acc=currentAccount();if(acc)accounts=accounts.filter(x=>x.email!==acc.email);saveAccounts();clearSession();modal=null;authView='welcome';authForm={values:{},errors:{}};render();return}
});
root.addEventListener('input',ev=>{
 if(ev.target.id==='search')document.querySelector('#picker').innerHTML=pickerRows(ev.target.value);
 if(ev.target.id==='signupPw'){const m=document.querySelector('#pwMeter');if(m){const s=passwordStrength(ev.target.value);m.className='pw-meter '+s.label.toLowerCase();m.querySelectorAll('.pw-seg').forEach((seg,i)=>seg.classList.toggle('on',i<s.score));const lab=m.querySelector('.pw-label');if(lab)lab.textContent=ev.target.value?((s.label==='Strong'?'Strong':s.label)+' password'):''}}
 if(ev.target.id==='trainingSearch'){trainingQuery=ev.target.value;applyTrainingSearch()}
 if(ev.target.id==='discoverSearch'){applyDiscoverFilter()}
 if(ev.target.id==='nbWeight'&&nb)nb.answers.weightKg=ev.target.value;
 if(ev.target.id==='nbHeight'&&nb)nb.answers.heightCm=ev.target.value;
 if(ev.target.id==='volumeRange'){const lab=document.querySelector('#volumePct');if(lab)lab.textContent=Math.round(+ev.target.value*100)+'%'}
});
root.addEventListener('change',ev=>{const e=ev.target;if(e.dataset.pref){const k=e.dataset.pref;let v=e.type==='checkbox'?e.checked:e.value;if(['volume','frequency','rest'].includes(k))v=Number(v);if(k==='rest'&&(!Number.isFinite(v)||v<1||v>600)){e.value=prefs.rest;return}prefs[k]=v;if(k==='voice'&&!v)silence();persist()}if(e.dataset.step!==undefined){const v=+e.value;if(Number.isFinite(v)&&v>=1&&v<=3600)draft[+e.dataset.step].value=v;else e.value=draft[+e.dataset.step].value}if(e.id==='nbPrefer'&&nb){nb.answers.preferNotToSay=e.checked;if(e.checked){nb.answers.weightKg='';nb.answers.heightCm=''}render()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){engine.interrupt();silence();persist()}});window.addEventListener('pagehide',()=>{engine.interrupt();persist()});
setInterval(()=>{if(route.name!=='player')return;engine.tick();const timer=document.querySelector('#timer');const rc=document.querySelector('#restCaption');if(rc&&engine.state==='REST'&&engine.session)rc.textContent=`Rest ${Math.ceil((engine.phaseTotal||0)/1000)}s total · ${Math.ceil(engine.remaining/1000)}s left · set by the imported routine (10s or 25s per step; 25s when the source sets none).`;if(timer)timer.textContent=timerText();const ring=document.querySelector('#ring');if(ring&&engine.left!==null&&engine.session){const ms=engine.phaseTotal||1;ring.style.setProperty('--ratio',String(Math.max(0,Math.min(1,engine.remaining/ms))))}if(['READY','EXERCISE','REST'].includes(engine.state)&&engine.left!==null){const sec=Math.ceil(engine.remaining/1000),key=engine.state+engine.session.index+':'+sec;if(sec>0&&sec<=3&&key!==lastCue){lastCue=key;beep()}}},100);
setInterval(()=>{if(engine.session&&route.name==='player'){checkpoint=engine.snapshot();persist()}},1000);
window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(modal){modal=null;render()}else if(authView&&authView.startsWith('legal-')){authView=legalFrom==='settings'?null:(legalFrom||'welcome');legalFrom=null;render()}else if(route.name==='player')engine.requestExit();else back()}});
/** Discover filter + search, applied in the DOM so typing never loses
 * focus. Matches on textContent, which is layout-independent: the
 * layout-dependent text property of a hidden card is '' in real browsers,
 * so a hidden card could never re-match.
 * Sections carry data-module; chips filter sections, search filters cards,
 * rows and focus tiles inside the visible sections. */
function applyDiscoverFilter(){
 const q=(document.querySelector('#discoverSearch')?.value||'').trim().toLowerCase();
 document.querySelectorAll('.discover-chips .chip').forEach(c=>c.classList.toggle('selected',c.dataset.id===discoverFilter));
 let visible=0;const total=document.querySelectorAll('.discovery .card,.discovery .sleep-row').length;
 for(const section of document.querySelectorAll('.discover-section')){
  const byFilter=discoverFilter==='all'||section.dataset.module===discoverFilter;
  let matches=0;
  for(const card of section.querySelectorAll('.card,.sleep-row,.focus-tile')){
   const ok=!q||card.textContent.toLowerCase().includes(q);
   card.hidden=!ok;if(ok)matches++;
  }
  section.hidden=!byFilter||matches===0;
  if(byFilter)visible+=matches;
 }
 const count=document.querySelector('#discoverCount');
 if(count)count.textContent=(q||discoverFilter!=='all')?visible+' matches':total+' titles';
}
render();animateCoaches();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
await loadData();render();
