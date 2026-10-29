// Local-only accounts + new-onboarding matching for Har Ghar Fitness.
// Pure logic only: no DOM, no storage access here, so node tests can import
// this file directly. Nothing in this file ever holds a plaintext password:
// sign-up stores a random salt plus a SHA-256 digest of (salt + password).
// Fitness data has no server and is never synced; no email is ever sent.
// Google sign-in is the one exception: it contacts Google only to verify an
// email (see GOOGLE-SIGNIN.md) — it never uploads fitness data.
export const ACCOUNTS_KEY='hgf-accounts-v1';
export const SESSION_KEY='hgf-session-v1';

// Password strength is GUIDANCE ONLY: it never blocks sign-up beyond the
// existing >=8 rule in validatePassword. Score = count of rules met:
// length >= 8, mixed case, a digit, a symbol. 0-1 = Weak, 2 = Fair, 3-4 = Strong.
export function passwordStrength(pw){
  const s=String(pw||'');
  let score=0;
  if(s.length>=8)score++;
  if(/[a-z]/.test(s)&&/[A-Z]/.test(s))score++;
  if(/\d/.test(s))score++;
  if(/[^A-Za-z0-9]/.test(s))score++;
  return {score, label:score<=1?'Weak':score===2?'Fair':'Strong'};
}

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
// only the salt and the digest are kept, never a password in plain text.
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

// ---- REAL Google sign-in: pure helpers (see GOOGLE-SIGNIN.md) ------------
// Google verifies identity ONLY (email + name). Fitness data syncs to the
// fitness server for signed-in accounts (see server-sync.js); it is never
// sent to Google. The secret is exchanged server-side and NEVER appears
// in this file.
// Reused client: the studydesk.fun OAuth client (redirect URI
// https://fitness.studydesk.fun/google-callback.php); its consent screen
// shows that client's existing branding.
export const GOOGLE_BACKEND_ORIGIN='https://fitness.studydesk.fun';

// Shape of a Google-verified account record (device-local fallback, used
// only where no server session exists — e.g. the Pages preview token path):
// same storage key as password accounts, but no salt/hash — password login
// must refuse these accounts with a truthful "uses Google sign-in" message,
// never the generic error.
export function createGoogleAccountRecord({name,email}){
  const norm=normalizeEmail(email);
  return {name:String(name||'').trim()||norm.split('@')[0],email:norm,provider:'google',googleVerified:true,salt:null,hash:null,createdAt:new Date().toISOString(),onboarded:false,profile:null};
}

// Decision table for a Google-verified identity arriving in the app.
// currentEmail: email of the currently signed-in local account, or null.
// Returns one action the app must follow exactly (see GOOGLE-SIGNIN.md).
export function resolveGoogleLink({accounts,currentEmail,googleEmail,googleName}){
  const email=normalizeEmail(googleEmail);
  const name=String(googleName||'').trim()||email.split('@')[0];
  if(currentEmail&&normalizeEmail(currentEmail)!==email){
    return {action:'blocked-different-account',currentEmail:normalizeEmail(currentEmail),googleEmail:email};
  }
  const acc=(accounts||[]).find(x=>normalizeEmail(x.email)===email);
  if(!acc)return {action:'create',email,name};
  if(acc.provider==='google'||(!acc.hash&&!acc.salt))return {action:'signin',email};
  if(acc.googleVerified)return {action:'signin',email};
  return {action:'link',email};
}

// Must stay byte-identical in wording to hgf_error_message() in
// server/lib/oauth.php. Every failure lands back in the app with a message;
// no failure path ever creates a session.
export function googleErrorMessage(code){
  const map={
    access_denied:'Google sign-in was cancelled. You can try again or continue as a guest.',
    state_mismatch:'Sign-in was interrupted (security check failed). Please try again.',
    exchange_failed:'Google could not complete sign-in. Please try again.',
    id_token_invalid:"Google's sign-in response could not be verified. Please try again.",
    email_unverified:"That Google account's email is not verified. Use a verified Google account or continue with email.",
    not_configured:'Google sign-in is not set up yet. Continue with email or as a guest.',
    invalid_return:'Sign-in was interrupted. Please try again.',
    unknown:'Google sign-in could not be completed. Please try again.',
  };
  return map[code]||map.unknown;
}

// Backend start URL for the "Continue with Google" button. GitHub Pages
// cannot run the backend, so the preview points at the production backend
// (which returns a 5-minute one-time token); every other host uses its own
// origin. return_to is the app's own URL (index.html stripped, no query),
// which the backend allowlists and falls back from if it does not match.
export function googleStartUrl({hostname='',origin='',pathname='/'}={}){
  const isPreview=String(hostname).endsWith('github.io');
  const base=isPreview?GOOGLE_BACKEND_ORIGIN:origin;
  let path=String(pathname||'/');
  if(path.endsWith('index.html'))path=path.slice(0,-'index.html'.length);
  if(!path.endsWith('/'))path+='/';
  return base+'/google-login.php?return_to='+encodeURIComponent(origin+path);
}

// Identity endpoint: same-origin cookie mode, or the production backend
// with a one-time token (preview only — the token is stripped from the URL
// immediately after exchange, per GOOGLE-SIGNIN.md).
export function googleMeUrl({hostname='',origin='',token=null}={}){
  if(token)return GOOGLE_BACKEND_ORIGIN+'/google-me.php?token='+encodeURIComponent(token);
  return origin+'/google-me.php';
}

// Backend logout endpoint (fire-and-forget; local logout must succeed even
// if the backend is unreachable). Same preview/production split as start.
export function googleLogoutUrl({hostname='',origin=''}={}){
  return (String(hostname).endsWith('github.io')?GOOGLE_BACKEND_ORIGIN:origin)+'/google-logout.php';
}

// Reachability probe for the "Continue with Google" button (v5.9 fix):
// the same identity endpoint the return flow reads, on the backend that
// would serve the sign-in. Preview hosts ping the production backend —
// cross-origin status reads are allowed by the preview-origin CORS
// allowlist in server/google-me.php (no credentials, no user data). Any
// other host pings its own origin. The app treats a 404, a network failure,
// or a CORS rejection as "backend not available here" and stays in the app.
export function googlePingUrl({hostname='',origin=''}={}){
  return (String(hostname).endsWith('github.io')?GOOGLE_BACKEND_ORIGIN:origin)+'/google-me.php';
}

// Remove ONLY the google return params from a query string, preserving any
// other param (e.g. tab=meal). Returns '' or a leading-'?' query string.
export function stripGoogleParams(search){
  const sp=new URLSearchParams(String(search||''));
  sp.delete('google');sp.delete('google_error');sp.delete('google_token');
  const rest=sp.toString();
  return rest?('?'+rest):'';
}
