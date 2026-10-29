// Local-only accounts + new-onboarding matching for Har Ghar Fitness.
// Pure logic only: no DOM, no storage access here, so node tests can import
// this file directly. Nothing in this file ever holds a plaintext password:
// sign-up stores a random salt plus a SHA-256 digest of (salt + password).
// There is no server, no sync and no email sending anywhere in the app.
export const ACCOUNTS_KEY='hgf-accounts-v1';
export const SESSION_KEY='hgf-session-v1';

export function normalizeEmail(email){return String(email||'').trim().toLowerCase()}
export function validateEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email))}
export function validatePassword(pw){return typeof pw==='string'&&pw.length>=8}
export function validateSignup({name,email,password,confirm,terms}){
  const errors={};
  if(!String(name||'').trim())errors.name='Enter your full name.';
  if(!validateEmail(email))errors.email='Enter a valid email address.';
  if(!validatePassword(password))errors.password='Password must be at least 8 characters.';
  if(password!==confirm)errors.confirm='Passwords do not match.';
  if(!terms)errors.terms='Tick the box to agree to the Terms & Privacy Policy.';
  return errors;
}
export function randomSaltHex(){
  const bytes=new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function hashPassword(password,saltHex){
  const bytes=new TextEncoder().encode(saltHex+':'+password);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// Shape of one stored account. There is deliberately no password field:
// only the salt and the digest are kept, on this device only.
export function createAccountRecord({name,email,salt,hash}){
  return {name:String(name||'').trim(),email:normalizeEmail(email),salt,hash,createdAt:new Date().toISOString(),onboarded:false,profile:null};
}

// New-onboarding steps, in order. 'generating' names only real local work
// (matching answers to the bundled programs, checking mapped days, saving
// on this device); 'plan' is the plan-ready screen.
export const NB_STEPS=['gender','focus','goals','motivation','pushups','discomfort','activity','weekly','measurements','generating','plan'];
export function defaultNbAnswers(){
  return {gender:null,focus:['full'],goals:'Keep Fit',motivation:null,pushups:'0',discomfort:[],activity:null,frequency:3,weightKg:'',heightCm:'',preferNotToSay:false};
}
// Plan matching. Honest and deliberately narrow:
//  - one focus only -> that focus program at the mapped level;
//  - Full Body, several foci, or no focus -> the 28-day Full Body program;
//  - push-ups 0 or 1-10 -> Beginner, 10+ -> Intermediate, never Advanced
//    (Advanced is never assigned from a questionnaire alone);
//  - if the computed id is not in the bundled programs, fall back to the
//    28-day Full Body Beginner program rather than inventing anything.
export function matchPlan({focus=[],pushups='0',programIds}){
  const set=programIds instanceof Set?programIds:new Set(programIds||[]);
  const levelNum=pushups==='10+'?2:1;
  const levelName=levelNum===2?'Intermediate':'Beginner';
  let id=null;
  if(focus.length===1){
    const map={arm:`d_ar_${levelNum}`,chest:`d_ch_${levelNum}`,abs:`d_ab_${levelNum}`,leg:`d_le_${levelNum}`,full:`7__4_${levelNum===2?'intermediate':'beginner'}`};
    id=map[focus[0]]||null;
  }
  if(!id)id=`7__4_${levelNum===2?'intermediate':'beginner'}`;
  const fellBack=!set.has(id);
  if(fellBack)id='7__4_beginner';
  return {programId:id,level:levelNum,levelName,fellBack};
}
