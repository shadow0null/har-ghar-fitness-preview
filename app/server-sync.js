// Har Ghar Fitness — server sync layer (v5.10).
//
// Pure logic + a thin fetch client. No DOM here, so node tests can import
// this file directly. The app (app.js) owns its own state; this module
// decides WHAT to do (upload / download / ask / queue) and talks to the
// server endpoints. It never invents data and never silently overwrites:
// when device history and server history both exist and differ, the app
// must ask the user (see decideDataFlow) and apply only the chosen side.
//
// Deploy layout matters: the PHP endpoints live at the WEB ROOT
// (https://fitness.studydesk.fun/auth-me.php, ...), while the app lives
// under /app/. Same origin, so the session cookie (path /) is sent with
// every call. On GitHub Pages there is no same-origin backend, so the
// data API base is null there: password sign-in fails honestly and Guest
// mode keeps working (Google preview sign-in keeps its existing verified
// token flow, which creates a device-local account on preview only).

// Data API base for this host, or null when there is no same-origin backend.
export function serverApiBase({hostname = '', origin = ''} = {}) {
  if (String(hostname).endsWith('github.io')) return null;
  if (!origin) return null;
  return String(origin).replace(/\/$/, '');
}
export function serverAvailable({hostname = '', origin = ''} = {}) {
  return serverApiBase({hostname, origin}) !== null;
}

// ---- Merge rules (never silently overwrite) ---------------------------------
function historyKey(h) {
  return (Array.isArray(h) ? h : []).map(s => `${s.id}|${s.finishedAt}|${s.completed ? 1 : 0}`).sort().join('\n');
}
export function historiesDiffer(deviceData, serverData) {
  return historyKey(deviceData?.history) !== historyKey(serverData?.history);
}
// Returns: 'upload' (no server copy yet — migrate device data),
// 'download' (device has no history — take the server copy),
// 'none' (histories agree — keep the device copy for now),
// 'choice' (both sides have different history — the app MUST ask).
export function decideDataFlow({deviceData = {}, serverData = null} = {}) {
  if (!serverData) return 'upload';
  const deviceHistory = Array.isArray(deviceData.history) ? deviceData.history : [];
  const serverHistory = Array.isArray(serverData.history) ? serverData.history : [];
  if (deviceHistory.length === 0 && serverHistory.length > 0) return 'download';
  if (!historiesDiffer(deviceData, serverData)) return 'none';
  if (serverHistory.length === 0) return 'upload';
  return 'choice';
}

// ---- Offline queue (last-write-wins, one pending payload) --------------------
export function coalesceQueue(queue, payload) {
  return {pending: payload, dirty: true};
}
export function clearQueue() {
  return {pending: null, dirty: false};
}

// ---- Plain-words sync status (no jargon) --------------------------------------
export function syncStatusText({serverAvailable: avail = false, online = true, dirty = false, lastError = false, hasSession = false} = {}) {
  if (!avail) return 'Server sign-in isn\'t available here';
  if (!hasSession) return 'Not signed in';
  if (!online) return 'Not synced — you\'re offline';
  if (lastError) return 'Couldn\'t save — will retry';
  if (dirty) return 'Saving…';
  return 'Saved on the server';
}

// ---- Server error codes -> plain-words messages --------------------------------
export function serverErrorMessage(code) {
  const map = {
    invalid: 'That code is not valid or has expired.',
    invalid_credentials: 'Email or password is incorrect.',
    invalid_input: 'Check the details you entered and try again.',
    invalid_data: 'Saved data was not valid. Try again.',
    voided: 'This code is no longer valid. Request a new code.',
    cooldown: 'Wait a minute before requesting a new code.',
    rate_limited: 'Too many codes requested. Try again later.',
    email_failed: 'We could not send the verification email. Try again.',
    email_unavailable: 'Email verification is not set up yet. Try again later.',
    unverified: 'Verify your email to continue. Enter the code we sent, or request a new one.',
    not_configured: 'Server sign-in isn\'t available here',
    unauthorized: 'Your session ended. Log in again.',
    google_only: 'This account uses Google sign-in. Use Continue with Google.',
    email_exists: 'An account with this email already exists. Log in instead, or continue as a guest.',
    already_verified: 'This account is already verified. Log in instead.',
    not_found: 'No unverified account for this email.',
    method: 'Something went wrong. Try again.',
    server_error: 'Something went wrong. Try again.',
    network: 'Could not reach the server. Check your connection and try again.',
    unknown: 'Something went wrong. Try again.',
  };
  return map[code] || map.unknown;
}

// ---- Thin fetch client (fetchImpl is injectable for tests) ----------------------
export function createServerClient({fetchImpl, base}) {
  async function request(path, {method = 'GET', body = null} = {}) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return {ok: false, error: 'network'};
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!data || typeof data !== 'object') {
      return {ok: false, error: res.ok ? 'unknown' : 'not_configured', status: res.status};
    }
    return {...data, status: res.status};
  }
  return {
    me: () => request('/auth-me.php'),
    register: ({name, email, password}) => request('/auth-register.php', {method: 'POST', body: {name, email, password}}),
    verifyOtp: ({email, code}) => request('/auth-verify-otp.php', {method: 'POST', body: {email, code}}),
    resendOtp: ({email}) => request('/auth-resend-otp.php', {method: 'POST', body: {email}}),
    login: ({email, password, remember}) => request('/auth-login.php', {method: 'POST', body: {email, password, remember: !!remember}}),
    forgotRequest: ({email}) => request('/auth-forgot-request.php', {method: 'POST', body: {email}}),
    forgotReset: ({email, code, password}) => request('/auth-forgot-reset.php', {method: 'POST', body: {email, code, password}}),
    logout: () => request('/auth-logout.php', {method: 'POST'}),
    getData: () => request('/data-get.php'),
    putData: (data) => request('/data-put.php', {method: 'POST', body: {data}}),
    deleteAccount: () => request('/account-delete.php', {method: 'POST'}),
  };
}

// ---- Evidence snapshot shape (mirrors the app's persist() document) --------------
export function snapshotEvidence(s) {
  return {
    prefs: s.prefs || {},
    history: s.history || [],
    edits: s.edits || {},
    custom: s.custom || [],
    onboarded: !!s.onboarded,
    ob: s.ob || 0,
    checkpoint: s.checkpoint || null,
    sessionLabel: s.sessionLabel || null,
    recent: s.recent || [],
    profile: s.profile || null,
    nb: s.nb || null,
  };
}
