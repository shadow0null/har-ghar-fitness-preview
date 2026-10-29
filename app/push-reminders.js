// Har Ghar Fitness — browser push reminders: pure logic (no DOM at import).
//
// This module is deliberately DOM-free so node tests can import it directly.
// It answers three questions the app needs:
//   1. Is a reminder due right now? (scheduled day + time window + timezone)
//   2. Should the app show its small in-app scheduled-day notice?
//   3. What state is the reminder control in? (permission / guest / server)
//
// Days use JavaScript getDay() numbers: 0 = Sunday ... 6 = Saturday.
// The weekly schedule in prefs uses Mon..Sun names (see plannedDayNames in
// app.js); plannedNamesToDayNumbers() converts between the two.
// Reminder prefs live in the app's prefs object: reminderTime ('HH:MM') and
// reminderDays (array of getDay numbers, or null = follow the weekly
// schedule). Whether this browser is actually subscribed is per-device
// state (PushManager), never a pref — a second device starts unsubscribed
// even when the account's reminder time/days already synced to it.

// Send window: a cron that runs every 15 minutes must not miss a reminder
// when one run fails, so a reminder stays due for 60 minutes after its
// time. The sent-state guard (one send per subscription per scheduled day,
// kept server-side) is what prevents double-sending inside the window.
export const REMINDER_WINDOW_MINUTES = 60;
export const REMINDER_DEFAULT_TIME = '07:00';

const NAME_TO_DAY = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Weekly-schedule names (Mon..Sun) -> getDay numbers (0=Sun..6=Sat).
export function plannedNamesToDayNumbers(names) {
  if (!Array.isArray(names)) return [];
  const out = [];
  for (const n of names) {
    const d = NAME_TO_DAY[n];
    if (d !== undefined && !out.includes(d)) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

// Keep only valid getDay numbers, de-duplicated and sorted. An empty or
// invalid list falls back to `fallback` (same rules); an empty fallback
// means "no scheduled days", never "every day".
export function normalizeReminderDays(days, fallback) {
  const clean = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const d of list) {
      const n = Number(d);
      if (Number.isInteger(n) && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
    }
    return out.sort((a, b) => a - b);
  };
  const main = clean(days);
  if (main.length) return main;
  return clean(fallback);
}

export function validReminderTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
export function normalizeReminderTime(t) {
  return validReminderTime(t) ? t : REMINDER_DEFAULT_TIME;
}
export function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
export function dayShortName(dayNumber) {
  return DAY_SHORT[dayNumber] ?? '';
}
export function dayFullName(dayNumber) {
  return DAY_NAMES[dayNumber] ?? '';
}

// Local calendar parts of `date` in `timeZone` (Intl, so DST is handled by
// the platform). hourCycle h23 avoids the midnight '24' quirk.
export function partsInTimezone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return {weekday, hour, minute: parseInt(get('minute'), 10)};
}
function dateStrInTimezone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'});
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// Due check. Returns {due, sendDate}: sendDate is the scheduled day
// (YYYY-MM-DD in the subscription timezone) the window belongs to, so the
// server can record one send per subscription per scheduled day.
// Two candidates are checked: today's window, and yesterday's window when
// it crosses midnight (e.g. a 23:30 reminder is still due at 00:15).
export function reminderDueAt({days, time, timeZone, now = new Date(), windowMinutes = REMINDER_WINDOW_MINUTES} = {}) {
  const daysN = normalizeReminderDays(days, []);
  if (!daysN.length || !validReminderTime(time)) return {due: false, sendDate: null};
  const target = timeToMinutes(time);
  const today = partsInTimezone(now, timeZone);
  const todayStr = dateStrInTimezone(now, timeZone);
  const nowMin = today.hour * 60 + today.minute;
  if (daysN.includes(today.weekday)) {
    const diff = nowMin - target;
    if (diff >= 0 && diff < windowMinutes) return {due: true, sendDate: todayStr};
  }
  const yestWeekday = (today.weekday + 6) % 7;
  if (daysN.includes(yestWeekday)) {
    const diff = nowMin + 1440 - target;
    if (diff >= 0 && diff < windowMinutes) return {due: true, sendDate: shiftDateStr(todayStr, -1)};
  }
  return {due: false, sendDate: null};
}

// Due AND not already sent for that scheduled day.
export function isReminderDue({days, time, timeZone, now = new Date(), sentDates = [], windowMinutes = REMINDER_WINDOW_MINUTES} = {}) {
  const r = reminderDueAt({days, time, timeZone, now, windowMinutes});
  if (!r.due) return false;
  return !sentDates.includes(r.sendDate);
}

// ---- In-app scheduled-day notice (no permission needed, guests included) ----
export function trainedOnDay(history, date = new Date()) {
  const ds = date.toDateString();
  return (Array.isArray(history) ? history : []).some(
    (s) => s && s.finishedAt && new Date(s.finishedAt).toDateString() === ds,
  );
}
// A short honest notice, or null. Shown only on a scheduled day when the
// user has not recorded any session yet today. It never claims a push
// was sent — it is just the app noticing the day when opened.
export function scheduledDayNotice({days, history, now = new Date()} = {}) {
  const daysN = normalizeReminderDays(days, []);
  if (!daysN.includes(now.getDay())) return null;
  if (trainedOnDay(history, now)) return null;
  return 'Today is a scheduled workout day.';
}

// ---- Reminder control state machine (what the Settings row shows) -----------
// supported: Notification + PushManager + serviceWorker all present.
// signedIn: a server session exists (push is signed-in accounts only).
// serverAvailable: a same-origin backend exists (false on Pages preview).
// permission: Notification.permission ('default' | 'granted' | 'denied').
// subscribed: this browser currently holds a PushManager subscription.
// States: 'hidden' (row not rendered at all), 'disabled-guest',
// 'disabled-noserver', 'blocked', 'on', 'off'. 'blocked' keeps its toggle
// interactive: if the user unblocks in browser settings and returns, the
// permission reads 'default' again and a fresh gesture can prompt.
export function describePushState({supported, permission, subscribed, signedIn, serverAvailable} = {}) {
  if (!supported) return {state: 'hidden'};
  if (!signedIn) return {state: 'disabled-guest', reason: 'Sign in to enable reminders'};
  if (!serverAvailable) return {state: 'disabled-noserver', reason: "Server reminders aren't available here"};
  if (permission === 'denied') {
    return {state: 'blocked', reason: 'Notifications are blocked in this browser. Allow notifications for this site in your browser settings, then turn reminders on.'};
  }
  if (subscribed) return {state: 'on'};
  return {state: 'off'};
}

// ---- VAPID key conversion (browser + node both provide atob/btoa) -----------
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
export function uint8ArrayToBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
